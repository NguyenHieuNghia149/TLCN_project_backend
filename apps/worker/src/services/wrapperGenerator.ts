type Language = 'cpp' | 'java' | 'python';

type ScalarType = 'integer' | 'string' | 'boolean';

type ScalarNode = {
  type: ScalarType;
};

type ArrayNode = {
  type: 'array';
  items: ScalarType;
};

type TypeNode = ScalarNode | ArrayNode;

type ASTArgument = {
  name: string;
  type: ScalarType | 'array';
  items?: ScalarType;
};

type AST = {
  name: string;
  returnType: TypeNode;
  args: ASTArgument[];
};

type NormalizedArgument = {
  name: string;
  type: TypeNode;
};

type NormalizedSignature = {
  name: string;
  returnType: TypeNode;
  args: NormalizedArgument[];
};

const SCALAR_TYPES: ReadonlySet<ScalarType> = new Set(['integer', 'string', 'boolean']);
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string
): void {
  const unknownKeys = Object.keys(value).filter(key => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${path} contains unsupported keys: ${unknownKeys.join(', ')}`);
  }
}

function validateIdentifier(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }

  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${path} must be a valid identifier`);
  }

  return value;
}

function validateScalarType(value: unknown, path: string): ScalarType {
  if (typeof value !== 'string' || !SCALAR_TYPES.has(value as ScalarType)) {
    throw new Error(`${path} must be one of: ${Array.from(SCALAR_TYPES).join(', ')}`);
  }

  return value as ScalarType;
}

function validateTypeNode(value: unknown, path: string): TypeNode {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  if (value.type === 'array') {
    assertAllowedKeys(value, ['type', 'items'], path);

    if (!('items' in value)) {
      throw new Error(`${path}.items is required for array types`);
    }

    return {
      type: 'array',
      items: validateScalarType(value.items, `${path}.items`),
    };
  }

  assertAllowedKeys(value, ['type'], path);
  return {
    type: validateScalarType(value.type, `${path}.type`),
  };
}

function validateArgument(value: unknown, index: number): NormalizedArgument {
  const path = `signature.args[${index}]`;

  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  assertAllowedKeys(value, ['name', 'type', 'items'], path);

  const name = validateIdentifier(value.name, `${path}.name`);
  const typeValue = value.type;

  if (typeValue === 'array') {
    if (!('items' in value)) {
      throw new Error(`${path}.items is required when type is array`);
    }

    return {
      name,
      type: {
        type: 'array',
        items: validateScalarType(value.items, `${path}.items`),
      },
    };
  }

  if ('items' in value && value.items !== undefined) {
    throw new Error(`${path}.items is only allowed when type is array`);
  }

  return {
    name,
    type: {
      type: validateScalarType(typeValue, `${path}.type`),
    },
  };
}

function normalizeSignature(signature: AST): NormalizedSignature {
  if (!isRecord(signature)) {
    throw new Error('signature must be an object');
  }

  assertAllowedKeys(signature, ['name', 'returnType', 'args'], 'signature');

  const name = validateIdentifier(signature.name, 'signature.name');
  const returnType = validateTypeNode(signature.returnType, 'signature.returnType');

  if (!Array.isArray(signature.args)) {
    throw new Error('signature.args must be an array');
  }

  const args = signature.args.map((argument, index) => validateArgument(argument, index));
  const seenNames = new Set<string>();

  for (const argument of args) {
    if (seenNames.has(argument.name)) {
      throw new Error(`signature.args contains duplicate name: ${argument.name}`);
    }

    seenNames.add(argument.name);
  }

  return {
    name,
    returnType,
    args,
  };
}

function ensureUserCode(userCode: string): string {
  if (typeof userCode !== 'string' || userCode.trim().length === 0) {
    throw new Error('userCode must be a non-empty string');
  }

  return userCode.replace(/\r\n/g, '\n');
}

function mapCppScalar(type: ScalarType): string {
  switch (type) {
    case 'integer':
      return 'int';
    case 'string':
      return 'std::string';
    case 'boolean':
      return 'bool';
  }
}

function mapCppType(type: TypeNode): string {
  if (type.type === 'array') {
    return `std::vector<${mapCppScalar(type.items)}>`;
  }

  return mapCppScalar(type.type);
}

function mapJavaScalar(type: ScalarType): string {
  switch (type) {
    case 'integer':
      return 'int';
    case 'string':
      return 'String';
    case 'boolean':
      return 'boolean';
  }
}

function mapJavaType(type: TypeNode): string {
  if (type.type === 'array') {
    return `${mapJavaScalar(type.items)}[]`;
  }

  return mapJavaScalar(type.type);
}

function mapPythonScalar(type: ScalarType): string {
  switch (type) {
    case 'integer':
      return 'int';
    case 'string':
      return 'str';
    case 'boolean':
      return 'bool';
  }
}

function mapPythonType(type: TypeNode): string {
  if (type.type === 'array') {
    return `List[${mapPythonScalar(type.items)}]`;
  }

  return mapPythonScalar(type.type);
}

function stripJavaPublicSolutionClass(userCode: string): string {
  return userCode.replace(/(^|\n)(\s*)public\s+class\s+Solution\b/, '$1$2class Solution');
}

function escapeStringLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildCppArgumentExtraction(argument: NormalizedArgument): string[] {
  const key = escapeStringLiteral(argument.name);
  const typeName = mapCppType(argument.type);

  return [
    `    if (!payload.contains("${key}")) {`,
    `        std::cerr << "Missing required argument: ${key}";`,
    '        return 1;',
    '    }',
    `    const ${typeName} ${argument.name} = payload.at("${key}").get<${typeName}>();`,
  ];
}

function buildCppWrapper(signature: NormalizedSignature, userCode: string): string {
  const extractions = signature.args.flatMap(argument => buildCppArgumentExtraction(argument));
  const callArguments = signature.args.map(argument => argument.name).join(', ');

  return [
    '#include <iostream>',
    '#include <vector>',
    '#include <string>',
    '#include <chrono>',
    '#include <iterator>',
    '#include <nlohmann/json.hpp>',
    '',
    'using json = nlohmann::json;',
    '',
    '#line 1 "solution.cpp"',
    userCode,
    '#line 1 "wrapper.cpp"',
    '',
    'int main() {',
    '    const std::string rawInput(',
    '        (std::istreambuf_iterator<char>(std::cin)),',
    '        std::istreambuf_iterator<char>()',
    '    );',
    '',
    '    if (rawInput.empty()) {',
    '        std::cerr << "Missing JSON input payload";',
    '        return 1;',
    '    }',
    '',
    '    const json payload = json::parse(rawInput);',
    '',
    '    if (!payload.is_object()) {',
    '        std::cerr << "Input payload must be a JSON object";',
    '        return 1;',
    '    }',
    '',
    ...extractions,
    ...(extractions.length > 0 ? [''] : []),
    '    Solution solution;',
    '    const auto start = std::chrono::high_resolution_clock::now();',
    `    auto result = solution.${signature.name}(${callArguments});`,
    '    const auto end = std::chrono::high_resolution_clock::now();',
    '    const double elapsedMs =',
    '        std::chrono::duration<double, std::milli>(end - start).count();',
    '    const long long roundedMs = static_cast<long long>(',
    '        elapsedMs >= 0.0 ? elapsedMs + 0.5 : elapsedMs - 0.5',
    '    );',
    '',
    '    json envelope = json::object();',
    '    envelope["actual_output"] = json(result);',
    '    envelope["time_taken_ms"] = roundedMs;',
    '',
    '    std::cout << envelope.dump();',
    '    return 0;',
    '}',
    '',
  ].join('\n');
}

function buildJavaArgumentReader(argument: NormalizedArgument): string {
  const fieldName = escapeStringLiteral(argument.name);

  if (argument.type.type === 'array') {
    switch (argument.type.items) {
      case 'integer':
        return `        ${mapJavaType(argument.type)} ${argument.name} = readIntegerArray(payload, "${fieldName}");`;
      case 'string':
        return `        ${mapJavaType(argument.type)} ${argument.name} = readStringArray(payload, "${fieldName}");`;
      case 'boolean':
        return `        ${mapJavaType(argument.type)} ${argument.name} = readBooleanArray(payload, "${fieldName}");`;
    }
  }

  switch (argument.type.type) {
    case 'integer':
      return `        ${mapJavaType(argument.type)} ${argument.name} = readInteger(payload, "${fieldName}");`;
    case 'string':
      return `        ${mapJavaType(argument.type)} ${argument.name} = readString(payload, "${fieldName}");`;
    case 'boolean':
      return `        ${mapJavaType(argument.type)} ${argument.name} = readBoolean(payload, "${fieldName}");`;
  }
}

function buildJavaWrapper(signature: NormalizedSignature, userCode: string): string {
  const sanitizedUserCode = stripJavaPublicSolutionClass(userCode);
  const readers = signature.args.map(argument => buildJavaArgumentReader(argument));
  const callArguments = signature.args.map(argument => argument.name).join(', ');

  return [
    'import java.util.*;',
    'import java.time.*;',
    'import java.nio.charset.StandardCharsets;',
    'import com.fasterxml.jackson.databind.JsonNode;',
    'import com.fasterxml.jackson.databind.ObjectMapper;',
    '',
    sanitizedUserCode,
    '',
    'public class Main {',
    '    private static final ObjectMapper MAPPER = new ObjectMapper();',
    '',
    '    private static JsonNode requireField(JsonNode payload, String fieldName) {',
    '        JsonNode node = payload.get(fieldName);',
    '        if (node == null || node.isMissingNode()) {',
    '            throw new IllegalArgumentException("Missing required argument: " + fieldName);',
    '        }',
    '        return node;',
    '    }',
    '',
    '    private static int readInteger(JsonNode payload, String fieldName) {',
    '        JsonNode node = requireField(payload, fieldName);',
    '        if (!node.isIntegralNumber()) {',
    '            throw new IllegalArgumentException("Argument " + fieldName + " must be an integer");',
    '        }',
    '        return node.intValue();',
    '    }',
    '',
    '    private static String readString(JsonNode payload, String fieldName) {',
    '        JsonNode node = requireField(payload, fieldName);',
    '        if (!node.isTextual()) {',
    '            throw new IllegalArgumentException("Argument " + fieldName + " must be a string");',
    '        }',
    '        return node.textValue();',
    '    }',
    '',
    '    private static boolean readBoolean(JsonNode payload, String fieldName) {',
    '        JsonNode node = requireField(payload, fieldName);',
    '        if (!node.isBoolean()) {',
    '            throw new IllegalArgumentException("Argument " + fieldName + " must be a boolean");',
    '        }',
    '        return node.booleanValue();',
    '    }',
    '',
    '    private static int[] readIntegerArray(JsonNode payload, String fieldName) throws Exception {',
    '        JsonNode node = requireField(payload, fieldName);',
    '        if (!node.isArray()) {',
    '            throw new IllegalArgumentException("Argument " + fieldName + " must be an array");',
    '        }',
    '        return MAPPER.treeToValue(node, int[].class);',
    '    }',
    '',
    '    private static String[] readStringArray(JsonNode payload, String fieldName) throws Exception {',
    '        JsonNode node = requireField(payload, fieldName);',
    '        if (!node.isArray()) {',
    '            throw new IllegalArgumentException("Argument " + fieldName + " must be an array");',
    '        }',
    '        return MAPPER.treeToValue(node, String[].class);',
    '    }',
    '',
    '    private static boolean[] readBooleanArray(JsonNode payload, String fieldName) throws Exception {',
    '        JsonNode node = requireField(payload, fieldName);',
    '        if (!node.isArray()) {',
    '            throw new IllegalArgumentException("Argument " + fieldName + " must be an array");',
    '        }',
    '        return MAPPER.treeToValue(node, boolean[].class);',
    '    }',
    '',
    '    public static void main(String[] args) throws Exception {',
    '        String rawInput = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);',
    '        if (rawInput.trim().isEmpty()) {',
    '            throw new IllegalArgumentException("Missing JSON input payload");',
    '        }',
    '',
    '        JsonNode payload = MAPPER.readTree(rawInput);',
    '        if (payload == null || !payload.isObject()) {',
    '            throw new IllegalArgumentException("Input payload must be a JSON object");',
    '        }',
    '',
    ...readers,
    ...(readers.length > 0 ? [''] : []),
    '        Solution solution = new Solution();',
    '        long startNs = System.nanoTime();',
    `        Object result = solution.${signature.name}(${callArguments});`,
    '        long endNs = System.nanoTime();',
    '        long elapsedMs = Math.round((endNs - startNs) / 1_000_000.0);',
    '',
    '        Map<String, Object> envelope = new LinkedHashMap<>();',
    '        envelope.put("actual_output", result);',
    '        envelope.put("time_taken_ms", elapsedMs);',
    '        System.out.print(MAPPER.writeValueAsString(envelope));',
    '    }',
    '}',
    '',
  ].join('\n');
}

function buildPythonArgumentReader(argument: NormalizedArgument): string {
  const fieldName = escapeStringLiteral(argument.name);

  if (argument.type.type === 'array') {
    switch (argument.type.items) {
      case 'integer':
        return `    ${argument.name} = _read_integer_array(payload, "${fieldName}")`;
      case 'string':
        return `    ${argument.name} = _read_string_array(payload, "${fieldName}")`;
      case 'boolean':
        return `    ${argument.name} = _read_boolean_array(payload, "${fieldName}")`;
    }
  }

  switch (argument.type.type) {
    case 'integer':
      return `    ${argument.name} = _read_integer(payload, "${fieldName}")`;
    case 'string':
      return `    ${argument.name} = _read_string(payload, "${fieldName}")`;
    case 'boolean':
      return `    ${argument.name} = _read_boolean(payload, "${fieldName}")`;
  }
}

function buildPythonWrapper(signature: NormalizedSignature, userCode: string): string {
  const readers = signature.args.map(argument => buildPythonArgumentReader(argument));
  const callArguments = signature.args.map(argument => argument.name).join(', ');

  return [
    'import json',
    'import sys',
    'import time',
    'from typing import List',
    '',
    userCode,
    '',
    'def _require_arg(payload, name):',
    '    if name not in payload:',
    '        raise KeyError(f"Missing required argument: {name}")',
    '    return payload[name]',
    '',
    'def _read_integer(payload, name):',
    '    value = _require_arg(payload, name)',
    '    if not isinstance(value, int) or isinstance(value, bool):',
    '        raise TypeError(f"Argument {name} must be an integer")',
    '    return value',
    '',
    'def _read_string(payload, name):',
    '    value = _require_arg(payload, name)',
    '    if not isinstance(value, str):',
    '        raise TypeError(f"Argument {name} must be a string")',
    '    return value',
    '',
    'def _read_boolean(payload, name):',
    '    value = _require_arg(payload, name)',
    '    if not isinstance(value, bool):',
    '        raise TypeError(f"Argument {name} must be a boolean")',
    '    return value',
    '',
    'def _read_integer_array(payload, name):',
    '    value = _require_arg(payload, name)',
    '    if not isinstance(value, list):',
    '        raise TypeError(f"Argument {name} must be an array")',
    '    for index, item in enumerate(value):',
    '        if not isinstance(item, int) or isinstance(item, bool):',
    '            raise TypeError(f"Argument {name}[{index}] must be an integer")',
    '    return value',
    '',
    'def _read_string_array(payload, name):',
    '    value = _require_arg(payload, name)',
    '    if not isinstance(value, list):',
    '        raise TypeError(f"Argument {name} must be an array")',
    '    for index, item in enumerate(value):',
    '        if not isinstance(item, str):',
    '            raise TypeError(f"Argument {name}[{index}] must be a string")',
    '    return value',
    '',
    'def _read_boolean_array(payload, name):',
    '    value = _require_arg(payload, name)',
    '    if not isinstance(value, list):',
    '        raise TypeError(f"Argument {name} must be an array")',
    '    for index, item in enumerate(value):',
    '        if not isinstance(item, bool):',
    '            raise TypeError(f"Argument {name}[{index}] must be a boolean")',
    '    return value',
    '',
    'def main():',
    '    raw_input = sys.stdin.read()',
    '    if not raw_input.strip():',
    '        raise ValueError("Missing JSON input payload")',
    '',
    '    payload = json.loads(raw_input)',
    '    if not isinstance(payload, dict):',
    '        raise TypeError("Input payload must be a JSON object")',
    '',
    ...readers,
    ...(readers.length > 0 ? [''] : []),
    '    solution = Solution()',
    '    start = time.perf_counter()',
    `    result = solution.${signature.name}(${callArguments})`,
    '    end = time.perf_counter()',
    '    elapsed_ms = int(round((end - start) * 1000))',
    '    sys.stdout.write(json.dumps({"actual_output": result, "time_taken_ms": elapsed_ms}))',
    '',
    "if __name__ == '__main__':",
    '    main()',
    '',
  ].join('\n');
}

export function generateWrapper(language: Language, signature: AST, userCode: string): string {
  const normalizedSignature = normalizeSignature(signature);
  const normalizedUserCode = ensureUserCode(userCode);

  switch (language) {
    case 'cpp':
      return buildCppWrapper(normalizedSignature, normalizedUserCode);
    case 'java':
      return buildJavaWrapper(normalizedSignature, normalizedUserCode);
    case 'python':
      return buildPythonWrapper(normalizedSignature, normalizedUserCode);
    default:
      throw new Error(`Unsupported language: ${String(language)}`);
  }
}
