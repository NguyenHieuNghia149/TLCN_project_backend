import {
  CanonicalFunctionArgument,
  CanonicalFunctionSignature,
  CanonicalFunctionTypeNode,
  FunctionScalarType,
  FunctionSignature,
} from '@backend/shared/types';
import { normalizeFunctionSignature } from '@backend/shared/utils';

type Language = 'cpp' | 'java' | 'python';

function ensureUserCode(userCode: string): string {
  if (typeof userCode !== 'string' || userCode.trim().length === 0) {
    throw new Error('userCode must be a non-empty string');
  }

  return userCode.replace(/\r\n/g, '\n');
}

function escapeStringLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isScalarNode(
  descriptor: CanonicalFunctionTypeNode,
): descriptor is { type: FunctionScalarType } {
  return descriptor.type !== 'array' && descriptor.type !== 'nullable';
}

function isFlatJavaScalarArray(
  descriptor: CanonicalFunctionTypeNode,
): descriptor is { type: 'array'; items: { type: FunctionScalarType } } {
  return descriptor.type === 'array' && isScalarNode(descriptor.items);
}

function toCppScalarType(typeName: FunctionScalarType): string {
  switch (typeName) {
    case 'integer':
      return 'int';
    case 'number':
      return 'double';
    case 'string':
      return 'std::string';
    case 'boolean':
      return 'bool';
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

function buildCppArgumentExtraction(argument: CanonicalFunctionArgument): string[] {
  const key = escapeStringLiteral(argument.name);
  const typeName = toCppType(argument.type);

  return [
    `    if (!payload.contains("${key}")) {`,
    `        std::cerr << "Missing required argument: ${key}";`,
    '        return 1;',
    '    }',
    `    const ${typeName} ${argument.name} = payload.at("${key}").get<${typeName}>();`,
  ];
}

function buildCppWrapper(signature: CanonicalFunctionSignature, userCode: string): string {
  const extractions = signature.args.flatMap(argument => buildCppArgumentExtraction(argument));
  const callArguments = signature.args.map(argument => argument.name).join(', ');

  return [
    '#include <iostream>',
    '#include <vector>',
    '#include <string>',
    '#include <optional>',
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

function toJavaScalarType(typeName: FunctionScalarType, boxed: boolean): string {
  switch (typeName) {
    case 'integer':
      return boxed ? 'Integer' : 'int';
    case 'number':
      return boxed ? 'Double' : 'double';
    case 'string':
      return 'String';
    case 'boolean':
      return boxed ? 'Boolean' : 'boolean';
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

function toJavaScalarReader(typeName: FunctionScalarType): string {
  switch (typeName) {
    case 'integer':
      return 'readInteger';
    case 'number':
      return 'readNumber';
    case 'string':
      return 'readString';
    case 'boolean':
      return 'readBoolean';
  }
}

function toJavaArrayReader(typeName: FunctionScalarType): string {
  switch (typeName) {
    case 'integer':
      return 'readIntegerArray';
    case 'number':
      return 'readNumberArray';
    case 'string':
      return 'readStringArray';
    case 'boolean':
      return 'readBooleanArray';
  }
}

function toJavaBoxedScalarType(typeName: FunctionScalarType): string {
  return toJavaScalarType(typeName, true);
}

function buildJavaTypeReference(descriptor: CanonicalFunctionTypeNode): string {
  return `new TypeReference<${toJavaType(descriptor, 'generic')}>() {}`;
}

function buildJavaArgumentReader(argument: CanonicalFunctionArgument): string {
  const fieldName = escapeStringLiteral(argument.name);
  const typeName = toJavaType(argument.type);

  if (argument.type.type === 'nullable' && isScalarNode(argument.type.value)) {
    return `        ${typeName} ${argument.name} = readTypedValue(payload, "${fieldName}", ${toJavaBoxedScalarType(argument.type.value.type)}.class);`;
  }

  if (isFlatJavaScalarArray(argument.type)) {
    return `        ${typeName} ${argument.name} = ${toJavaArrayReader(argument.type.items.type)}(payload, "${fieldName}");`;
  }

  if (isScalarNode(argument.type)) {
    return `        ${typeName} ${argument.name} = ${toJavaScalarReader(argument.type.type)}(payload, "${fieldName}");`;
  }

  return `        ${typeName} ${argument.name} = readTypedValue(payload, "${fieldName}", ${buildJavaTypeReference(argument.type)});`;
}

function stripJavaPublicSolutionClass(userCode: string): string {
  return userCode.replace(/(^|\n)(\s*)public\s+class\s+Solution\b/, '$1$2class Solution');
}

function buildJavaWrapper(signature: CanonicalFunctionSignature, userCode: string): string {
  const sanitizedUserCode = stripJavaPublicSolutionClass(userCode);
  const readers = signature.args.map(argument => buildJavaArgumentReader(argument));
  const callArguments = signature.args.map(argument => argument.name).join(', ');

  return [
    'import java.util.*;',
    'import java.nio.charset.StandardCharsets;',
    'import com.fasterxml.jackson.core.type.TypeReference;',
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
    '    private static double readNumber(JsonNode payload, String fieldName) {',
    '        JsonNode node = requireField(payload, fieldName);',
    '        if (!node.isNumber()) {',
    '            throw new IllegalArgumentException("Argument " + fieldName + " must be a number");',
    '        }',
    '        return node.doubleValue();',
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
    '    private static double[] readNumberArray(JsonNode payload, String fieldName) throws Exception {',
    '        JsonNode node = requireField(payload, fieldName);',
    '        if (!node.isArray()) {',
    '            throw new IllegalArgumentException("Argument " + fieldName + " must be an array");',
    '        }',
    '        return MAPPER.treeToValue(node, double[].class);',
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
    '    private static <T> T readTypedValue(JsonNode payload, String fieldName, Class<T> clazz) {',
    '        JsonNode node = requireField(payload, fieldName);',
    '        if (node.isNull()) {',
    '            return null;',
    '        }',
    '        return MAPPER.convertValue(node, clazz);',
    '    }',
    '',
    '    private static <T> T readTypedValue(JsonNode payload, String fieldName, TypeReference<T> typeReference) {',
    '        JsonNode node = requireField(payload, fieldName);',
    '        if (node.isNull()) {',
    '            return null;',
    '        }',
    '        return MAPPER.convertValue(node, typeReference);',
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

function buildPythonSignatureLiteral(signature: CanonicalFunctionSignature): string {
  return JSON.stringify(signature).replace(/\\/g, '\\\\').replace(/'''/g, "\\'\\'\\'");
}

function buildPythonWrapper(signature: CanonicalFunctionSignature, userCode: string): string {
  const readers = signature.args.map((argument, index) => [
    `    ${argument.name} = _require_arg(payload, "${escapeStringLiteral(argument.name)}")`,
    `    _assert_type(${argument.name}, SIGNATURE["args"][${index}]["type"], "${escapeStringLiteral(argument.name)}")`,
  ]).flat();
  const callArguments = signature.args.map(argument => argument.name).join(', ');
  const signatureLiteral = buildPythonSignatureLiteral(signature);

  return [
    'import json',
    'import sys',
    'import time',
    '',
    userCode,
    '',
    `SIGNATURE = json.loads(r'''${signatureLiteral}''')`,
    '',
    'def _require_arg(payload, name):',
    '    if name not in payload:',
    '        raise KeyError(f"Missing required argument: {name}")',
    '    return payload[name]',
    '',
    'def _assert_type(value, descriptor, path):',
    '    type_name = descriptor["type"]',
    '    if type_name == "nullable":',
    '        if value is None:',
    '            return',
    '        _assert_type(value, descriptor["value"], path)',
    '        return',
    '    if type_name == "array":',
    '        if not isinstance(value, list):',
    '            raise TypeError(f"Argument {path} must be an array")',
    '        for index, item in enumerate(value):',
    '            _assert_type(item, descriptor["items"], f"{path}[{index}]")',
    '        return',
    '    if type_name == "integer":',
    '        if not isinstance(value, int) or isinstance(value, bool):',
    '            raise TypeError(f"Argument {path} must be an integer")',
    '        return',
    '    if type_name == "number":',
    '        if (not isinstance(value, (int, float))) or isinstance(value, bool):',
    '            raise TypeError(f"Argument {path} must be a number")',
    '        return',
    '    if type_name == "string":',
    '        if not isinstance(value, str):',
    '            raise TypeError(f"Argument {path} must be a string")',
    '        return',
    '    if type_name == "boolean":',
    '        if not isinstance(value, bool):',
    '            raise TypeError(f"Argument {path} must be a boolean")',
    '        return',
    '    raise TypeError(f"Unsupported descriptor for {path}: {descriptor}")',
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

export function generateWrapper(language: Language, signature: FunctionSignature, userCode: string): string {
  const normalizedSignature = normalizeFunctionSignature(signature);
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
