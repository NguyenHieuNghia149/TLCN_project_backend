import {
  FunctionParameter,
  FunctionSignature,
  FunctionStarterCodeByLanguage,
  FunctionValueTypeDescriptor,
  ScalarTypeName,
} from '@backend/shared/types';

export type SupportedFunctionLanguage = 'cpp' | 'java' | 'python';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value == 'object' && value !== null && !Array.isArray(value);
}

function validateScalar(value: unknown, scalarType: ScalarTypeName): boolean {
  switch (scalarType) {
    case 'int':
    case 'long':
      return typeof value === 'number' && Number.isInteger(value);
    case 'double':
      return typeof value === 'number' && Number.isFinite(value);
    case 'bool':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
    default:
      return false;
  }
}

export function validateFunctionValue(
  value: unknown,
  descriptor: FunctionValueTypeDescriptor
): boolean {
  switch (descriptor.kind) {
    case 'scalar':
      return validateScalar(value, descriptor.name);
    case 'array':
      return Array.isArray(value) && value.every(item => validateScalar(item, descriptor.element));
    case 'matrix':
      return (
        Array.isArray(value) &&
        value.every(
          row => Array.isArray(row) && row.every(item => validateScalar(item, descriptor.element))
        )
      );
    default:
      return false;
  }
}

export function validateFunctionTestcaseInput(
  signature: FunctionSignature,
  input: unknown
): string | null {
  if (!isRecord(input)) {
    return 'Function-style testcase input must be an object keyed by parameter name.';
  }

  const inputKeys = Object.keys(input);
  const expectedKeys = signature.parameters.map(parameter => parameter.name);

  for (const key of expectedKeys) {
    if (!(key in input)) {
      return `Missing parameter input: ${key}`;
    }
  }

  for (const key of inputKeys) {
    if (!expectedKeys.includes(key)) {
      return `Unexpected parameter input: ${key}`;
    }
  }

  for (const parameter of signature.parameters) {
    if (!validateFunctionValue(input[parameter.name], parameter.type)) {
      return `Invalid input type for parameter: ${parameter.name}`;
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

export function buildFunctionInputDisplayValue(
  signature: FunctionSignature,
  input: Record<string, unknown>
): string {
  const orderedInput = signature.parameters.reduce<Record<string, unknown>>((accumulator, parameter) => {
    accumulator[parameter.name] = input[parameter.name];
    return accumulator;
  }, {});

  return canonicalizeStructuredValue(orderedInput);
}

function toCppType(descriptor: FunctionValueTypeDescriptor): string {
  switch (descriptor.kind) {
    case 'scalar':
      switch (descriptor.name) {
        case 'int':
          return 'int';
        case 'long':
          return 'long long';
        case 'double':
          return 'double';
        case 'bool':
          return 'bool';
        case 'string':
          return 'string';
      }
    case 'array':
      return `vector<${toCppScalarType(descriptor.element)}>`;
    case 'matrix':
      return `vector<vector<${toCppScalarType(descriptor.element)}>>`;
  }
}

function toCppScalarType(typeName: ScalarTypeName): string {
  switch (typeName) {
    case 'int':
      return 'int';
    case 'long':
      return 'long long';
    case 'double':
      return 'double';
    case 'bool':
      return 'bool';
    case 'string':
      return 'string';
  }
}

function toJavaType(descriptor: FunctionValueTypeDescriptor): string {
  switch (descriptor.kind) {
    case 'scalar':
      switch (descriptor.name) {
        case 'int':
          return 'int';
        case 'long':
          return 'long';
        case 'double':
          return 'double';
        case 'bool':
          return 'boolean';
        case 'string':
          return 'String';
      }
    case 'array':
      return `${toJavaScalarType(descriptor.element)}[]`;
    case 'matrix':
      return `${toJavaScalarType(descriptor.element)}[][]`;
  }
}

function toJavaScalarType(typeName: ScalarTypeName): string {
  switch (typeName) {
    case 'int':
      return 'int';
    case 'long':
      return 'long';
    case 'double':
      return 'double';
    case 'bool':
      return 'boolean';
    case 'string':
      return 'String';
  }
}

function toPythonTypeHint(descriptor: FunctionValueTypeDescriptor): string {
  switch (descriptor.kind) {
    case 'scalar':
      switch (descriptor.name) {
        case 'int':
        case 'long':
          return 'int';
        case 'double':
          return 'float';
        case 'bool':
          return 'bool';
        case 'string':
          return 'str';
      }
    case 'array':
      return `list[${toPythonScalarTypeHint(descriptor.element)}]`;
    case 'matrix':
      return `list[list[${toPythonScalarTypeHint(descriptor.element)}]]`;
  }
}

function toPythonScalarTypeHint(typeName: ScalarTypeName): string {
  switch (typeName) {
    case 'int':
    case 'long':
      return 'int';
    case 'double':
      return 'float';
    case 'bool':
      return 'bool';
    case 'string':
      return 'str';
  }
}

function defaultJavaReturn(descriptor: FunctionValueTypeDescriptor): string {
  switch (descriptor.kind) {
    case 'scalar':
      switch (descriptor.name) {
        case 'int':
          return '0';
        case 'long':
          return '0L';
        case 'double':
          return '0.0';
        case 'bool':
          return 'false';
        case 'string':
          return '""';
      }
    case 'array':
    case 'matrix':
      return 'null';
  }
}

function defaultPythonReturn(descriptor: FunctionValueTypeDescriptor): string {
  switch (descriptor.kind) {
    case 'scalar':
      switch (descriptor.name) {
        case 'int':
        case 'long':
          return '0';
        case 'double':
          return '0.0';
        case 'bool':
          return 'False';
        case 'string':
          return '""';
      }
    case 'array':
    case 'matrix':
      return '[]';
  }
}

function toCppParameterType(descriptor: FunctionValueTypeDescriptor): string {
  switch (descriptor.kind) {
    case 'scalar':
      return toCppType(descriptor);
    case 'array':
    case 'matrix':
      return `${toCppType(descriptor)}&`;
  }
}

function buildCppStarterCode(signature: FunctionSignature): string {
  const parameters = signature.parameters
    .map(parameter => `${toCppParameterType(parameter.type)} ${parameter.name}`)
    .join(', ');

  return [
    '#include <vector>',
    '#include <string>',
    'using namespace std;',
    '',
    'class Solution {',
    'public:',
    `    ${toCppType(signature.returnType)} ${signature.methodName}(${parameters}) {`,
    '        ',
    '        return {};',
    '    }',
    '};',
  ].join('\n');
}

function buildJavaStarterCode(signature: FunctionSignature): string {
  const parameters = signature.parameters
    .map(parameter => `${toJavaType(parameter.type)} ${parameter.name}`)
    .join(', ');

  return [
    'class Solution {',
    `    public ${toJavaType(signature.returnType)} ${signature.methodName}(${parameters}) {`,
    '        ',
    `        return ${defaultJavaReturn(signature.returnType)};`,
    '    }',
    '}',
  ].join('\n');
}

function buildPythonStarterCode(signature: FunctionSignature): string {
  const parameters = signature.parameters
    .map(parameter => `${parameter.name}: ${toPythonTypeHint(parameter.type)}`)
    .join(', ');

  const parameterList = parameters ? `self, ${parameters}` : 'self';

  return [
    'class Solution:',
    `    def ${signature.methodName}(${parameterList}) -> ${toPythonTypeHint(signature.returnType)}:`,
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

function toCppLiteral(descriptor: FunctionValueTypeDescriptor, value: unknown): string {
  switch (descriptor.kind) {
    case 'scalar':
      switch (descriptor.name) {
        case 'int':
          return String(value);
        case 'long':
          return `${String(value)}LL`;
        case 'double': {
          const text = String(value);
          return text.includes('.') ? text : `${text}.0`;
        }
        case 'bool':
          return value ? 'true' : 'false';
        case 'string':
          return escapeStringLiteral(String(value));
      }
    case 'array':
      return `{${(value as unknown[]).map(item => toCppLiteral({ kind: 'scalar', name: descriptor.element }, item)).join(', ')}}`;
    case 'matrix':
      return `{${(value as unknown[]).map(row => toCppLiteral({ kind: 'array', element: descriptor.element }, row)).join(', ')}}`;
  }
}

function toJavaLiteral(descriptor: FunctionValueTypeDescriptor, value: unknown): string {
  switch (descriptor.kind) {
    case 'scalar':
      switch (descriptor.name) {
        case 'int':
          return String(value);
        case 'long':
          return `${String(value)}L`;
        case 'double': {
          const text = String(value);
          return text.includes('.') ? text : `${text}.0`;
        }
        case 'bool':
          return value ? 'true' : 'false';
        case 'string':
          return escapeStringLiteral(String(value));
      }
    case 'array':
      return `new ${toJavaScalarType(descriptor.element)}[]{${(value as unknown[])
        .map(item => toJavaLiteral({ kind: 'scalar', name: descriptor.element }, item))
        .join(', ')}}`;
    case 'matrix':
      return `new ${toJavaScalarType(descriptor.element)}[][]{${(value as unknown[])
        .map(row => `{${(row as unknown[])
          .map(item => toJavaLiteral({ kind: 'scalar', name: descriptor.element }, item))
          .join(', ')}}`)
        .join(', ')}}`;
  }
}

function toPythonLiteral(descriptor: FunctionValueTypeDescriptor, value: unknown): string {
  switch (descriptor.kind) {
    case 'scalar':
      switch (descriptor.name) {
        case 'int':
        case 'long':
        case 'double':
          return String(value);
        case 'bool':
          return value ? 'True' : 'False';
        case 'string':
          return escapeStringLiteral(String(value));
      }
    case 'array':
      return `[${(value as unknown[])
        .map(item => toPythonLiteral({ kind: 'scalar', name: descriptor.element }, item))
        .join(', ')}]`;
    case 'matrix':
      return `[${(value as unknown[])
        .map(row => `[${(row as unknown[])
          .map(item => toPythonLiteral({ kind: 'scalar', name: descriptor.element }, item))
          .join(', ')}]`)
        .join(', ')}]`;
  }
}

function buildCppExecutionSource(
  userSource: string,
  signature: FunctionSignature,
  testcases: Array<Record<string, unknown>>
): string {
  const cases = testcases
    .map((input, index) => {
      const declarations = signature.parameters
        .map(parameter => {
          const literal = toCppLiteral(parameter.type, input[parameter.name]);
          return `            ${toCppType(parameter.type)} ${parameter.name} = ${literal};`;
        })
        .join('\n');

      const args = signature.parameters.map(parameter => parameter.name).join(', ');

      return [
        `        case ${index}: {`,
        declarations,
        `            auto result = solution.${signature.methodName}(${args});`,
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
    'template <typename T, typename enable_if<is_floating_point<T>::value, int>::type = 0>',
    'static string __toJson(const T& value) {',
    '    if (!isfinite(value)) return "null";',
    '    ostringstream stream;',
    '    stream << setprecision(15) << value;',
    '    string text = stream.str();',
    '    if (text.find(".") != string::npos) {',
    '        while (text.size() > 1 && text.back() == "0"[0]) text.pop_back();',
    '        if (!text.empty() && text.back() == "."[0]) text.pop_back();',
    '    }',
    '    return text;',
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
  signature: FunctionSignature,
  testcases: Array<Record<string, unknown>>
): string {
  const cases = testcases
    .map((input, index) => {
      const declarations = signature.parameters
        .map(parameter => {
          const literal = toJavaLiteral(parameter.type, input[parameter.name]);
          return `                ${toJavaType(parameter.type)} ${parameter.name} = ${literal};`;
        })
        .join('\n');
      const args = signature.parameters.map(parameter => parameter.name).join(', ');
      return [
        `            case ${index}: {`,
        declarations,
        `                Object result = solution.${signature.methodName}(${args});`,
        '                System.out.print(toJson(result));',
        '                return;',
        '            }',
      ].join('\n');
    })
    .join('\n');

  return [
    'import java.io.*;',
    'import java.lang.reflect.Array;',
    'import java.math.BigDecimal;',
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
    '    private static String numberToJson(Number value) {',
    '        if (value instanceof Float || value instanceof Double) {',
    '            BigDecimal decimal = BigDecimal.valueOf(value.doubleValue()).stripTrailingZeros();',
    '            String text = decimal.toPlainString();',
    '            return text.equals("-0") ? "0" : text;',
    '        }',
    '        return value.toString();',
    '    }',
    '',
    '    private static String toJson(Object value) {',
    '        if (value == null) return "null";',
    '        if (value instanceof String) return "\\\"" + escapeJson((String) value) + "\\\"";',
    '        if (value instanceof Boolean) return ((Boolean) value) ? "true" : "false";',
    '        if (value instanceof Number) return numberToJson((Number) value);',
    '        Class<?> clazz = value.getClass();',
    '        if (clazz.isArray()) {',
    '            int length = Array.getLength(value);',
    '            StringBuilder builder = new StringBuilder("[");',
    '            for (int index = 0; index < length; index++) {',
    '                if (index > 0) builder.append(",");',
    '                builder.append(toJson(Array.get(value, index)));',
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
  signature: FunctionSignature,
  testcases: Array<Record<string, unknown>>
): string {
  const cases = testcases
    .map((input, index) => {
      const declarations = signature.parameters
        .map(parameter => `        ${parameter.name} = ${toPythonLiteral(parameter.type, input[parameter.name])}`)
        .join('\n');
      const args = signature.parameters.map(parameter => parameter.name).join(', ');
      return [
        `${index_marker(index)}:`,
        declarations,
        `        result = solution.${signature.methodName}(${args})`,
        '        sys.stdout.write(_to_json(result))',
        '        return',
      ].join('\n');
    })
    .join('\n');

  return [
    'import json',
    'import math',
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
    '    if isinstance(value, float):',
    '        if not math.isfinite(value):',
    '            return "null"',
    '        return format(value, ".15g")',
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

function index_marker(index: number): string {
  return index === 0 ? '    if case_index == 0' : `    elif case_index == ${index}`;
}

export function buildFunctionExecutionSource(params: {
  language: SupportedFunctionLanguage;
  userSource: string;
  signature: FunctionSignature;
  testcases: Array<Record<string, unknown>>;
}): string {
  const { language, userSource, signature, testcases } = params;

  switch (language) {
    case 'cpp':
      return buildCppExecutionSource(userSource, signature, testcases);
    case 'java':
      return buildJavaExecutionSource(userSource, signature, testcases);
    case 'python':
      return buildPythonExecutionSource(userSource, signature, testcases);
  }
}
