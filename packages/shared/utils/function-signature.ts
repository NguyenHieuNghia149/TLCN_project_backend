import {
  FunctionSignature,
  FunctionStarterCodeByLanguage,
  FunctionTypeNode,
  FunctionScalarType,
} from '@backend/shared/types';
import { normalizeRuntimeSignature } from './ast-normalizer';

export type SupportedFunctionLanguage = 'cpp' | 'java' | 'python';

type RuntimeSignature = FunctionSignature;

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

function toCppParameterType(argument: RuntimeSignature['args'][number]): string {
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

function escapeStringLiteral(value: string): string {
  return JSON.stringify(value);
}

function toCppLiteral(descriptor: FunctionTypeNode, value: unknown): string {
  if (descriptor.type === 'array') {
    return `{${(value as unknown[])
      .map(item => toCppLiteral({ type: descriptor.items }, item))
      .join(', ')}}`;
  }

  switch (descriptor.type) {
    case 'integer':
      return String(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return escapeStringLiteral(String(value));
  }
}

function toJavaLiteral(descriptor: FunctionTypeNode, value: unknown): string {
  if (descriptor.type === 'array') {
    return `new ${toJavaScalarType(descriptor.items)}[]{${(value as unknown[])
      .map(item => toJavaLiteral({ type: descriptor.items }, item))
      .join(', ')}}`;
  }

  switch (descriptor.type) {
    case 'integer':
      return String(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return escapeStringLiteral(String(value));
  }
}

function toPythonLiteral(descriptor: FunctionTypeNode, value: unknown): string {
  if (descriptor.type === 'array') {
    return `[${(value as unknown[])
      .map(item => toPythonLiteral({ type: descriptor.items }, item))
      .join(', ')}]`;
  }

  switch (descriptor.type) {
    case 'integer':
      return String(value);
    case 'boolean':
      return value ? 'True' : 'False';
    case 'string':
      return escapeStringLiteral(String(value));
  }
}

function buildCppExecutionSource(
  userSource: string,
  signature: RuntimeSignature,
  testcases: Array<Record<string, unknown>>
): string {
  const cases = testcases
    .map((input, index) => {
      const declarations = signature.args
        .map(argument => {
          const descriptor: FunctionTypeNode =
            argument.type === 'array'
              ? { type: 'array', items: argument.items as FunctionScalarType }
              : { type: argument.type };
          const literal = toCppLiteral(descriptor, input[argument.name]);
          return `            ${toCppType(descriptor)} ${argument.name} = ${literal};`;
        })
        .join('\n');

      const args = signature.args.map(argument => argument.name).join(', ');

      return [
        `        case ${index}: {`,
        declarations,
        `            auto result = solution.${signature.name}(${args});`,
        '            cout << __toJson(result);',
        '            return 0;',
        '        }',
      ].join('\n');
    })
    .join('\n');

  return [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    '',
    'static string __escapeJson(const string& value) {',
    '    string escaped;',
    '    escaped.reserve(value.size());',
    '    for (char ch : value) {',
    '        if (ch == 92) { escaped.push_back(static_cast<char>(92)); escaped.push_back(static_cast<char>(92)); }',
    '        else if (ch == 34) { escaped.push_back(static_cast<char>(92)); escaped.push_back(static_cast<char>(34)); }',
    "        else if (ch == 10) { escaped.push_back(static_cast<char>(92)); escaped.push_back('n'); }",
    "        else if (ch == 13) { escaped.push_back(static_cast<char>(92)); escaped.push_back('r'); }",
    "        else if (ch == 9) { escaped.push_back(static_cast<char>(92)); escaped.push_back('t'); }",
    '        else { escaped += ch; }',
    '    }',
    '    return escaped;',
    '}',
    '',
    'template <typename T, typename enable_if<is_integral<T>::value && !is_same<T, bool>::value, int>::type = 0>',
    'static string __toJson(const T& value) {',
    '    return to_string(value);',
    '}',
    '',
    'static string __toJson(const bool& value) {',
    '    return value ? "true" : "false";',
    '}',
    '',
    'static string __toJson(const string& value) {',
    '    return string(1, static_cast<char>(34)) + __escapeJson(value) + string(1, static_cast<char>(34));',
    '}',
    '',
    'static string __toJson(const char* value) {',
    '    return __toJson(string(value));',
    '}',
    '',
    'template <typename T>',
    'static string __toJson(const vector<T>& values) {',
    '    string output = "[";',
    '    for (size_t index = 0; index < values.size(); ++index) {',
    '        if (index > 0) output += ",";',
    '        output += __toJson(values[index]);',
    '    }',
    '    output += "]";',
    '    return output;',
    '}',
    '',
    userSource,
    '',
    'int main() {',
    '    ios::sync_with_stdio(false);',
    '    cin.tie(nullptr);',
    '    int caseIndex = 0;',
    '    if (!(cin >> caseIndex)) {',
    '        return 1;',
    '    }',
    '    Solution solution;',
    '    switch (caseIndex) {',
    cases,
    '        default:',
    '            return 1;',
    '    }',
    '}',
  ].join('\n');
}

function buildJavaExecutionSource(
  userSource: string,
  signature: RuntimeSignature,
  testcases: Array<Record<string, unknown>>
): string {
  const cases = testcases
    .map((input, index) => {
      const declarations = signature.args
        .map(argument => {
          const descriptor: FunctionTypeNode =
            argument.type === 'array'
              ? { type: 'array', items: argument.items as FunctionScalarType }
              : { type: argument.type };
          const literal = toJavaLiteral(descriptor, input[argument.name]);
          return `                ${toJavaType(descriptor)} ${argument.name} = ${literal};`;
        })
        .join('\n');
      const args = signature.args.map(argument => argument.name).join(', ');
      return [
        `            case ${index}: {`,
        declarations,
        `                Object result = solution.${signature.name}(${args});`,
        '                System.out.print(toJson(result));',
        '                return;',
        '            }',
      ].join('\n');
    })
    .join('\n');

  return [
    'import java.io.*;',
    'import java.lang.reflect.Array;',
    'import java.nio.charset.StandardCharsets;',
    'import java.util.*;',
    '',
    userSource,
    '',
    'public class Main {',
    '    private static String escapeJson(String value) {',
    '        StringBuilder builder = new StringBuilder();',
    '        for (int i = 0; i < value.length(); i++) {',
    '            char ch = value.charAt(i);',
    '            switch (ch) {',
    '                case 92: builder.append((char) 92).append((char) 92); break;',
    '                case 34: builder.append((char) 92).append((char) 34); break;',
    "                case 10: builder.append((char) 92).append('n'); break;",
    "                case 13: builder.append((char) 92).append('r'); break;",
    "                case 9: builder.append((char) 92).append('t'); break;",
    '                default: builder.append(ch); break;',
    '            }',
    '        }',
    '        return builder.toString();',
    '    }',
    '',
    '    private static String toJson(Object value) {',
    '        if (value == null) return "null";',
    '        if (value instanceof String) return "\\\"" + escapeJson((String) value) + "\\\"";',
    '        if (value instanceof Boolean) return ((Boolean) value) ? "true" : "false";',
    '        if (value instanceof Number) return value.toString();',
    '        Class<?> clazz = value.getClass();',
    '        if (clazz.isArray()) {',
    '            int length = Array.getLength(value);',
    '            StringBuilder builder = new StringBuilder("[");',
    '            for (int idx = 0; idx < length; idx++) {',
    '                if (idx > 0) builder.append(",");',
    '                builder.append(toJson(Array.get(value, idx)));',
    '            }',
    '            builder.append("]");',
    '            return builder.toString();',
    '        }',
    '        throw new IllegalArgumentException("Unsupported return type: " + clazz.getName());',
    '    }',
    '',
    '    public static void main(String[] args) throws Exception {',
    '        String rawInput = new String(System.in.readAllBytes(), StandardCharsets.UTF_8).trim();',
    '        if (rawInput.isEmpty()) {',
    '            return;',
    '        }',
    '        int caseIndex = Integer.parseInt(rawInput);',
    '        Solution solution = new Solution();',
    '        switch (caseIndex) {',
    cases,
    '            default:',
    '                throw new IllegalArgumentException("Unknown testcase index: " + caseIndex);',
    '        }',
    '    }',
    '}',
  ].join('\n');
}

function buildPythonExecutionSource(
  userSource: string,
  signature: RuntimeSignature,
  testcases: Array<Record<string, unknown>>
): string {
  const cases = testcases
    .map((input, index) => {
      const declarations = signature.args
        .map(argument => {
          const descriptor: FunctionTypeNode =
            argument.type === 'array'
              ? { type: 'array', items: argument.items as FunctionScalarType }
              : { type: argument.type };
          return `        ${argument.name} = ${toPythonLiteral(descriptor, input[argument.name])}`;
        })
        .join('\n');
      const args = signature.args.map(argument => argument.name).join(', ');
      return [
        `${index === 0 ? '    if case_index == 0' : `    elif case_index == ${index}`}:`,
        declarations,
        `        result = solution.${signature.name}(${args})`,
        '        sys.stdout.write(_to_json(result))',
        '        return',
      ].join('\n');
    })
    .join('\n');

  return [
    'import json',
    'import sys',
    '',
    userSource,
    '',
    'def _to_json(value):',
    '    if value is None:',
    '        return "null"',
    '    if isinstance(value, bool):',
    '        return "true" if value else "false"',
    '    if isinstance(value, int) and not isinstance(value, bool):',
    '        return str(value)',
    '    if isinstance(value, str):',
    '        return json.dumps(value, ensure_ascii=False)',
    '    if isinstance(value, (list, tuple)):',
    '        return "[" + ",".join(_to_json(item) for item in value) + "]"',
    '    raise TypeError(f"Unsupported return type: {type(value)!r}")',
    '',
    'def main():',
    '    raw = sys.stdin.read().strip()',
    '    if not raw:',
    '        return',
    '    case_index = int(raw)',
    '    solution = Solution()',
    cases,
    '    raise ValueError(f"Unknown testcase index: {case_index}")',
    '',
    "if __name__ == '__main__':",
    '    main()',
  ].join('\n');
}

export function buildFunctionExecutionSource(params: {
  language: SupportedFunctionLanguage;
  userSource: string;
  signature: unknown;
  testcases: Array<Record<string, unknown>>;
}): string {
  const { language, userSource, signature, testcases } = params;
  const normalizedSignature = normalizeRuntimeSignature(signature) as RuntimeSignature;

  switch (language) {
    case 'cpp':
      return buildCppExecutionSource(userSource, normalizedSignature, testcases);
    case 'java':
      return buildJavaExecutionSource(userSource, normalizedSignature, testcases);
    case 'python':
      return buildPythonExecutionSource(userSource, normalizedSignature, testcases);
  }
}
