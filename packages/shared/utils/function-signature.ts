import {
  CanonicalFunctionSignature,
  CanonicalFunctionTypeNode,
  FunctionScalarType,
  FunctionSignature,
  FunctionStarterCodeByLanguage,
  FunctionTypeNode,
  IntegratedExecutableLanguageKey,
} from '@backend/shared/types';

import {
  normalizeFunctionSignature,
  normalizeFunctionTypeNode,
} from './function-signature-normalizer';
import { getIntegratedExecutableLanguageKeys } from './supported-languages';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalarNode(descriptor: CanonicalFunctionTypeNode): descriptor is { type: FunctionScalarType } {
  return descriptor.type !== 'array' && descriptor.type !== 'nullable';
}

function validateScalar(value: unknown, scalarType: FunctionScalarType): boolean {
  switch (scalarType) {
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
  }
}

function validateCanonicalFunctionValue(value: unknown, descriptor: CanonicalFunctionTypeNode): boolean {
  if (descriptor.type === 'nullable') {
    return value === null || validateCanonicalFunctionValue(value, descriptor.value);
  }

  if (descriptor.type === 'array') {
    return Array.isArray(value) && value.every(item => validateCanonicalFunctionValue(item, descriptor.items));
  }

  return validateScalar(value, descriptor.type);
}

/** Validates a runtime value against either legacy or canonical function type metadata. */
export function validateFunctionValue(value: unknown, descriptor: FunctionTypeNode): boolean {
  return validateCanonicalFunctionValue(value, normalizeFunctionTypeNode(descriptor));
}

/** Validates function-style testcase input against the normalized signature. */
export function validateFunctionTestcaseInput(
  signature: FunctionSignature,
  input: unknown,
): string | null {
  if (!isRecord(input)) {
    return 'Function-style testcase input must be an object keyed by argument name.';
  }

  const normalizedSignature = normalizeFunctionSignature(signature);
  const inputKeys = Object.keys(input);
  const expectedKeys = normalizedSignature.args.map(argument => argument.name);

  for (const key of expectedKeys) {
    if (!(key in input)) {
      return `Missing argument input: ${key}`;
    }
  }

  for (const key of inputKeys) {
    if (!expectedKeys.includes(key)) {
      return `Unexpected argument input: ${key}`;
    }
  }

  for (const argument of normalizedSignature.args) {
    if (!validateCanonicalFunctionValue(input[argument.name], argument.type)) {
      return `Invalid input type for argument: ${argument.name}`;
    }
  }

  return null;
}

/** Validates function-style testcase output against the normalized signature. */
export function validateFunctionTestcaseOutput(
  signature: FunctionSignature,
  output: unknown,
): string | null {
  if (!validateCanonicalFunctionValue(output, normalizeFunctionSignature(signature).returnType)) {
    return 'Invalid output type for function signature.';
  }

  return null;
}

/** Serializes any structured testcase value into canonical JSON text. */
export function canonicalizeStructuredValue(value: unknown): string {
  return JSON.stringify(value);
}

function formatDisplayValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => formatDisplayValue(item)).join(', ')}]`;
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return JSON.stringify(value);
  }

  return JSON.stringify(value);
}

/** Builds the stable multiline testcase input display from structured JSON. */
export function buildFunctionInputDisplayValue(
  signature: FunctionSignature,
  input: Record<string, unknown>,
): string {
  const normalizedSignature = normalizeFunctionSignature(signature);

  return normalizedSignature.args
    .map(argument => `${argument.name}: ${formatDisplayValue(input[argument.name])}`)
    .join('\n');
}

/** Builds the public testcase display payload directly from structured JSON values. */
export function buildTestcaseDisplay(
  signature: FunctionSignature,
  testcase: { inputJson: Record<string, unknown>; outputJson: unknown },
): { input: string; output: string } {
  return {
    input: buildFunctionInputDisplayValue(signature, testcase.inputJson),
    output: canonicalizeStructuredValue(testcase.outputJson),
  };
}

function toCppScalarType(typeName: FunctionScalarType): string {
  switch (typeName) {
    case 'integer':
      return 'int';
    case 'number':
      return 'double';
    case 'boolean':
      return 'bool';
    case 'string':
      return 'std::string';
  }
}

function toCppType(descriptor: CanonicalFunctionTypeNode): string {
  if (descriptor.type === 'array') {
    return `std::vector<${toCppType(descriptor.items)}>`;
  }

  if (descriptor.type === 'nullable') {
    return `std::optional<${toCppType(descriptor.value)}>`;
  }

  return toCppScalarType(descriptor.type);
}

function toJavaScalarType(typeName: FunctionScalarType, boxed: boolean): string {
  switch (typeName) {
    case 'integer':
      return boxed ? 'Integer' : 'int';
    case 'number':
      return boxed ? 'Double' : 'double';
    case 'boolean':
      return boxed ? 'Boolean' : 'boolean';
    case 'string':
      return 'String';
  }
}

function toJavaType(
  descriptor: CanonicalFunctionTypeNode,
  context: 'root' | 'generic' = 'root',
): string {
  if (descriptor.type === 'nullable') {
    return toJavaType(descriptor.value, 'generic');
  }

  if (descriptor.type === 'array') {
    if (context === 'root' && isScalarNode(descriptor.items)) {
      return `${toJavaScalarType(descriptor.items.type, false)}[]`;
    }

    return `List<${toJavaType(descriptor.items, 'generic')}>`;
  }

  return toJavaScalarType(descriptor.type, context === 'generic');
}

function toPythonScalarType(typeName: FunctionScalarType): string {
  switch (typeName) {
    case 'integer':
      return 'int';
    case 'number':
      return 'float';
    case 'boolean':
      return 'bool';
    case 'string':
      return 'str';
  }
}

function toPythonTypeHint(descriptor: CanonicalFunctionTypeNode): string {
  if (descriptor.type === 'nullable') {
    return `Optional[${toPythonTypeHint(descriptor.value)}]`;
  }

  if (descriptor.type === 'array') {
    return `List[${toPythonTypeHint(descriptor.items)}]`;
  }

  return toPythonScalarType(descriptor.type);
}

function defaultCppReturn(descriptor: CanonicalFunctionTypeNode): string {
  if (descriptor.type === 'array') {
    return '{}';
  }

  if (descriptor.type === 'nullable') {
    return 'std::nullopt';
  }

  switch (descriptor.type) {
    case 'integer':
      return '0';
    case 'number':
      return '0.0';
    case 'boolean':
      return 'false';
    case 'string':
      return '""';
  }
}

function defaultJavaReturn(descriptor: CanonicalFunctionTypeNode): string {
  if (descriptor.type === 'array' || descriptor.type === 'nullable') {
    return 'null';
  }

  switch (descriptor.type) {
    case 'integer':
      return '0';
    case 'number':
      return '0.0';
    case 'boolean':
      return 'false';
    case 'string':
      return '""';
  }
}

function defaultPythonReturn(descriptor: CanonicalFunctionTypeNode): string {
  if (descriptor.type === 'array') {
    return '[]';
  }

  if (descriptor.type === 'nullable') {
    return 'None';
  }

  switch (descriptor.type) {
    case 'integer':
      return '0';
    case 'number':
      return '0.0';
    case 'boolean':
      return 'False';
    case 'string':
      return '""';
  }
}

function toCppParameterType(descriptor: CanonicalFunctionTypeNode): string {
  if (descriptor.type === 'array' || descriptor.type === 'nullable') {
    return `const ${toCppType(descriptor)}&`;
  }

  return toCppType(descriptor);
}

function buildCppStarterCode(signature: CanonicalFunctionSignature): string {
  const parameters = signature.args
    .map(argument => `${toCppParameterType(argument.type)} ${argument.name}`)
    .join(', ');

  return [
    '#include <vector>',
    '#include <string>',
    '#include <optional>',
    '',
    'class Solution {',
    'public:',
    `    ${toCppType(signature.returnType)} ${signature.name}(${parameters}) {`,
    '        ',
    `        return ${defaultCppReturn(signature.returnType)};`,
    '    }',
    '};',
  ].join('\n');
}

function buildJavaStarterCode(signature: CanonicalFunctionSignature): string {
  const parameters = signature.args
    .map(argument => `${toJavaType(argument.type)} ${argument.name}`)
    .join(', ');

  return [
    'import java.util.List;',
    '',
    'class Solution {',
    `    public ${toJavaType(signature.returnType)} ${signature.name}(${parameters}) {`,
    '        ',
    `        return ${defaultJavaReturn(signature.returnType)};`,
    '    }',
    '}',
  ].join('\n');
}

function buildPythonStarterCode(signature: CanonicalFunctionSignature): string {
  const parameters = signature.args
    .map(argument => `${argument.name}: ${toPythonTypeHint(argument.type)}`)
    .join(', ');

  const parameterList = parameters ? `self, ${parameters}` : 'self';

  return [
    'from typing import List, Optional',
    '',
    'class Solution:',
    `    def ${signature.name}(${parameterList}) -> ${toPythonTypeHint(signature.returnType)}:`,
    '        ',
    `        return ${defaultPythonReturn(signature.returnType)}`,
  ].join('\n');
}

/** Builds starter code for one language from either legacy or canonical signature metadata. */
export function buildStarterCode(
  language: IntegratedExecutableLanguageKey,
  signature: FunctionSignature,
): string {
  const normalizedSignature = normalizeFunctionSignature(signature);

  switch (language) {
    case 'cpp':
      return buildCppStarterCode(normalizedSignature);
    case 'java':
      return buildJavaStarterCode(normalizedSignature);
    case 'python':
      return buildPythonStarterCode(normalizedSignature);
  }
}

/** Builds starter code for all supported languages from the normalized signature. */
export function buildStarterCodeByLanguage(
  signature: FunctionSignature,
): FunctionStarterCodeByLanguage {
  return getIntegratedExecutableLanguageKeys().reduce<FunctionStarterCodeByLanguage>((acc, language) => {
    acc[language] = buildStarterCode(language, signature);
    return acc;
  }, {});
}
