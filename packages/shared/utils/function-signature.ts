import {
  FunctionSignature,
  FunctionStarterCodeByLanguage,
  FunctionTypeNode,
  FunctionScalarType,
} from '@backend/shared/types';

export type SupportedFunctionLanguage = 'cpp' | 'java' | 'python';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateScalar(value: unknown, scalarType: FunctionScalarType): boolean {
  switch (scalarType) {
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
  }
}

export function validateFunctionValue(value: unknown, descriptor: FunctionTypeNode): boolean {
  if (descriptor.type === 'array') {
    return Array.isArray(value) && value.every(item => validateScalar(item, descriptor.items));
  }

  return validateScalar(value, descriptor.type);
}

export function validateFunctionTestcaseInput(
  signature: FunctionSignature,
  input: unknown
): string | null {
  if (!isRecord(input)) {
    return 'Function-style testcase input must be an object keyed by argument name.';
  }

  const inputKeys = Object.keys(input);
  const expectedKeys = signature.args.map(argument => argument.name);

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

  for (const argument of signature.args) {
    const descriptor: FunctionTypeNode =
      argument.type === 'array'
        ? { type: 'array', items: argument.items as FunctionScalarType }
        : { type: argument.type };

    if (!validateFunctionValue(input[argument.name], descriptor)) {
      return `Invalid input type for argument: ${argument.name}`;
    }
  }

  return null;
}

export function validateFunctionTestcaseOutput(
  signature: FunctionSignature,
  output: unknown
): string | null {
  if (!validateFunctionValue(output, signature.returnType)) {
    return 'Invalid output type for function signature.';
  }

  return null;
}

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

export function buildFunctionInputDisplayValue(
  signature: FunctionSignature,
  input: Record<string, unknown>
): string {
  return signature.args
    .map(argument => `${argument.name}: ${formatDisplayValue(input[argument.name])}`)
    .join('\n');
}

export function buildTestcaseDisplay(
  signature: FunctionSignature,
  testcase: { inputJson: Record<string, unknown>; outputJson: unknown }
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
    case 'boolean':
      return 'bool';
    case 'string':
      return 'std::string';
  }
}

function toCppType(descriptor: FunctionTypeNode): string {
  if (descriptor.type === 'array') {
    return `std::vector<${toCppScalarType(descriptor.items)}>`;
  }

  return toCppScalarType(descriptor.type);
}

function toJavaScalarType(typeName: FunctionScalarType): string {
  switch (typeName) {
    case 'integer':
      return 'int';
    case 'boolean':
      return 'boolean';
    case 'string':
      return 'String';
  }
}

function toJavaType(descriptor: FunctionTypeNode): string {
  if (descriptor.type === 'array') {
    return `${toJavaScalarType(descriptor.items)}[]`;
  }

  return toJavaScalarType(descriptor.type);
}

function toPythonScalarType(typeName: FunctionScalarType): string {
  switch (typeName) {
    case 'integer':
      return 'int';
    case 'boolean':
      return 'bool';
    case 'string':
      return 'str';
  }
}

function toPythonTypeHint(descriptor: FunctionTypeNode): string {
  if (descriptor.type === 'array') {
    return `List[${toPythonScalarType(descriptor.items)}]`;
  }

  return toPythonScalarType(descriptor.type);
}

function defaultCppReturn(descriptor: FunctionTypeNode): string {
  if (descriptor.type === 'array') {
    return '{}';
  }

  switch (descriptor.type) {
    case 'integer':
      return '0';
    case 'boolean':
      return 'false';
    case 'string':
      return '""';
  }
}

function defaultJavaReturn(descriptor: FunctionTypeNode): string {
  if (descriptor.type === 'array') {
    return 'null';
  }

  switch (descriptor.type) {
    case 'integer':
      return '0';
    case 'boolean':
      return 'false';
    case 'string':
      return '""';
  }
}

function defaultPythonReturn(descriptor: FunctionTypeNode): string {
  if (descriptor.type === 'array') {
    return '[]';
  }

  switch (descriptor.type) {
    case 'integer':
      return '0';
    case 'boolean':
      return 'False';
    case 'string':
      return '""';
  }
}

function toCppParameterType(argument: FunctionSignature['args'][number]): string {
  const descriptor: FunctionTypeNode =
    argument.type === 'array'
      ? { type: 'array', items: argument.items as FunctionScalarType }
      : { type: argument.type };

  if (descriptor.type === 'array') {
    return `${toCppType(descriptor)}&`;
  }

  return toCppType(descriptor);
}

function buildCppStarterCode(signature: FunctionSignature): string {
  const parameters = signature.args
    .map(argument => `${toCppParameterType(argument)} ${argument.name}`)
    .join(', ');

  return [
    '#include <vector>',
    '#include <string>',
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

function buildJavaStarterCode(signature: FunctionSignature): string {
  const parameters = signature.args
    .map(argument => {
      const descriptor: FunctionTypeNode =
        argument.type === 'array'
          ? { type: 'array', items: argument.items as FunctionScalarType }
          : { type: argument.type };
      return `${toJavaType(descriptor)} ${argument.name}`;
    })
    .join(', ');

  return [
    'class Solution {',
    `    public ${toJavaType(signature.returnType)} ${signature.name}(${parameters}) {`,
    '        ',
    `        return ${defaultJavaReturn(signature.returnType)};`,
    '    }',
    '}',
  ].join('\n');
}

function buildPythonStarterCode(signature: FunctionSignature): string {
  const parameters = signature.args
    .map(argument => {
      const descriptor: FunctionTypeNode =
        argument.type === 'array'
          ? { type: 'array', items: argument.items as FunctionScalarType }
          : { type: argument.type };
      return `${argument.name}: ${toPythonTypeHint(descriptor)}`;
    })
    .join(', ');

  const parameterList = parameters ? `self, ${parameters}` : 'self';

  return [
    'from typing import List',
    '',
    'class Solution:',
    `    def ${signature.name}(${parameterList}) -> ${toPythonTypeHint(signature.returnType)}:`,
    '        ',
    `        return ${defaultPythonReturn(signature.returnType)}`,
  ].join('\n');
}

export function buildStarterCode(
  language: SupportedFunctionLanguage,
  signature: FunctionSignature
): string {
  switch (language) {
    case 'cpp':
      return buildCppStarterCode(signature);
    case 'java':
      return buildJavaStarterCode(signature);
    case 'python':
      return buildPythonStarterCode(signature);
  }
}

export function buildStarterCodeByLanguage(
  signature: FunctionSignature
): FunctionStarterCodeByLanguage {
  return {
    cpp: buildStarterCode('cpp', signature),
    java: buildStarterCode('java', signature),
    python: buildStarterCode('python', signature),
  };
}
