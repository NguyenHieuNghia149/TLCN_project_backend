import {
  CanonicalFunctionArgument,
  CanonicalFunctionSignature,
  CanonicalFunctionTypeNode,
  FunctionScalarType,
} from '@backend/shared/types';

export type FunctionSignatureNormalizerErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'MISSING_FIELD'
  | 'DUPLICATE_ARG'
  | 'INVALID_SHAPE';

const SCALAR_TYPES: ReadonlySet<FunctionScalarType> = new Set([
  'integer',
  'number',
  'string',
  'boolean',
]);
const LEGACY_SCALAR_MAP: Record<string, FunctionScalarType> = {
  int: 'integer',
  integer: 'integer',
  float: 'number',
  double: 'number',
  number: 'number',
  bool: 'boolean',
  boolean: 'boolean',
  string: 'string',
};

/** Describes a validation error while converting legacy signature shapes. */
export class FunctionSignatureNormalizerError extends Error {
  readonly code: FunctionSignatureNormalizerErrorCode;

  constructor(code: FunctionSignatureNormalizerErrorCode, message: string) {
    super(message);
    this.name = 'FunctionSignatureNormalizerError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new FunctionSignatureNormalizerError('INVALID_SHAPE', `${path} must be an object`);
  }

  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new FunctionSignatureNormalizerError('MISSING_FIELD', `${path} must be a non-empty string`);
  }

  return value.trim();
}

function normalizeRuntimeScalar(value: unknown, path: string): FunctionScalarType {
  if (typeof value !== 'string') {
    throw new FunctionSignatureNormalizerError('INVALID_SHAPE', `${path} must be a string`);
  }

  if (!SCALAR_TYPES.has(value as FunctionScalarType)) {
    throw new FunctionSignatureNormalizerError(
      'UNSUPPORTED_TYPE',
      `${path} uses unsupported scalar type: ${value}`,
    );
  }

  return value as FunctionScalarType;
}

function normalizeLegacyScalar(value: unknown, path: string): FunctionScalarType {
  if (typeof value !== 'string') {
    throw new FunctionSignatureNormalizerError('INVALID_SHAPE', `${path} must be a string`);
  }

  const mapped = LEGACY_SCALAR_MAP[value];
  if (mapped) {
    return mapped;
  }

  throw new FunctionSignatureNormalizerError(
    'UNSUPPORTED_TYPE',
    `${path} uses unsupported legacy scalar type: ${value}`,
  );
}

function normalizeArrayItems(value: unknown, path: string): CanonicalFunctionTypeNode {
  if (isRecord(value)) {
    return normalizeFunctionTypeNode(value, path);
  }

  return { type: normalizeRuntimeScalar(value, path) };
}

function normalizeLegacyTypeNode(value: unknown, path: string): CanonicalFunctionTypeNode {
  const node = requireRecord(value, path);

  if (!('kind' in node)) {
    throw new FunctionSignatureNormalizerError('MISSING_FIELD', `${path}.kind is required`);
  }

  switch (node.kind) {
    case 'scalar':
      if (!('name' in node)) {
        throw new FunctionSignatureNormalizerError(
          'MISSING_FIELD',
          `${path}.name is required for scalar types`,
        );
      }

      return {
        type: normalizeLegacyScalar(node.name, `${path}.name`),
      };
    case 'array':
      if (!('element' in node)) {
        throw new FunctionSignatureNormalizerError(
          'MISSING_FIELD',
          `${path}.element is required for array types`,
        );
      }

      return {
        type: 'array',
        items: { type: normalizeLegacyScalar(node.element, `${path}.element`) },
      };
    default:
      throw new FunctionSignatureNormalizerError(
        'UNSUPPORTED_TYPE',
        `${path} uses unsupported legacy kind: ${String(node.kind)}`,
      );
  }
}

function ensureUniqueArgs(args: CanonicalFunctionArgument[]): void {
  const seen = new Set<string>();

  for (const arg of args) {
    if (seen.has(arg.name)) {
      throw new FunctionSignatureNormalizerError('DUPLICATE_ARG', `Duplicate argument name: ${arg.name}`);
    }

    seen.add(arg.name);
  }
}

/** Normalizes a runtime type node into the canonical recursive form. */
export function normalizeFunctionTypeNode(
  value: unknown,
  path = 'type',
): CanonicalFunctionTypeNode {
  const node = requireRecord(value, path);

  if (!('type' in node)) {
    throw new FunctionSignatureNormalizerError('MISSING_FIELD', `${path}.type is required`);
  }

  if (node.type === 'array') {
    if (!('items' in node)) {
      throw new FunctionSignatureNormalizerError('MISSING_FIELD', `${path}.items is required for array types`);
    }

    return {
      type: 'array',
      items: normalizeArrayItems(node.items, `${path}.items`),
    };
  }

  if (node.type === 'nullable') {
    if (!('value' in node)) {
      throw new FunctionSignatureNormalizerError('MISSING_FIELD', `${path}.value is required for nullable types`);
    }

    return {
      type: 'nullable',
      value: normalizeFunctionTypeNode(node.value, `${path}.value`),
    };
  }

  if ('items' in node && node.items !== undefined) {
    throw new FunctionSignatureNormalizerError('INVALID_SHAPE', `${path}.items is only allowed for array types`);
  }

  if ('value' in node && node.value !== undefined) {
    throw new FunctionSignatureNormalizerError('INVALID_SHAPE', `${path}.value is only allowed for nullable types`);
  }

  return {
    type: normalizeRuntimeScalar(node.type, `${path}.type`),
  };
}

function normalizeCanonicalArgument(value: unknown, index: number): CanonicalFunctionArgument {
  const path = `signature.args[${index}]`;
  const node = requireRecord(value, path);
  const name = requireString(node.name, `${path}.name`);

  if (!('type' in node)) {
    throw new FunctionSignatureNormalizerError('MISSING_FIELD', `${path}.type is required`);
  }

  if (isRecord(node.type)) {
    if ('items' in node && node.items !== undefined) {
      throw new FunctionSignatureNormalizerError('INVALID_SHAPE', `${path}.items is not allowed when type is an object node`);
    }

    return {
      name,
      type: normalizeFunctionTypeNode(node.type, `${path}.type`),
    };
  }

  if (node.type === 'array') {
    if (!('items' in node)) {
      throw new FunctionSignatureNormalizerError('MISSING_FIELD', `${path}.items is required for array arguments`);
    }

    return {
      name,
      type: {
        type: 'array',
        items: normalizeArrayItems(node.items, `${path}.items`),
      },
    };
  }

  if ('items' in node && node.items !== undefined) {
    throw new FunctionSignatureNormalizerError('INVALID_SHAPE', `${path}.items is only allowed for array arguments`);
  }

  return {
    name,
    type: {
      type: normalizeRuntimeScalar(node.type, `${path}.type`),
    },
  };
}

function normalizeLegacyArgument(value: unknown, index: number): CanonicalFunctionArgument {
  const path = `signature.parameters[${index}]`;
  const node = requireRecord(value, path);
  const name = requireString(node.name, `${path}.name`);

  if (!('type' in node)) {
    throw new FunctionSignatureNormalizerError('MISSING_FIELD', `${path}.type is required`);
  }

  return {
    name,
    type: normalizeLegacyTypeNode(node.type, `${path}.type`),
  };
}

/** Converts any supported runtime dialect into the canonical recursive signature shape. */
export function normalizeFunctionSignature(rawSignature: unknown): CanonicalFunctionSignature {
  const signature = requireRecord(rawSignature, 'signature');

  if ('name' in signature && 'args' in signature) {
    const name = requireString(signature.name, 'signature.name');

    if (!('returnType' in signature)) {
      throw new FunctionSignatureNormalizerError('MISSING_FIELD', 'signature.returnType is required');
    }

    if (!Array.isArray(signature.args)) {
      throw new FunctionSignatureNormalizerError('MISSING_FIELD', 'signature.args must be an array');
    }

    const args = signature.args.map((arg, index) => normalizeCanonicalArgument(arg, index));
    ensureUniqueArgs(args);

    return {
      name,
      args,
      returnType: normalizeFunctionTypeNode(signature.returnType, 'signature.returnType'),
    };
  }

  if ('methodName' in signature && 'parameters' in signature) {
    const name = requireString(signature.methodName, 'signature.methodName');

    if (!('returnType' in signature)) {
      throw new FunctionSignatureNormalizerError('MISSING_FIELD', 'signature.returnType is required');
    }

    if (!Array.isArray(signature.parameters)) {
      throw new FunctionSignatureNormalizerError('MISSING_FIELD', 'signature.parameters must be an array');
    }

    const args = signature.parameters.map((arg, index) => normalizeLegacyArgument(arg, index));
    ensureUniqueArgs(args);

    return {
      name,
      args,
      returnType: normalizeLegacyTypeNode(signature.returnType, 'signature.returnType'),
    };
  }

  throw new FunctionSignatureNormalizerError(
    'INVALID_SHAPE',
    'signature does not match a supported dialect (expected either name/args or methodName/parameters)',
  );
}

/** Alias kept for migration/runtime callers that already use the old helper name. */
export const normalizeRuntimeSignature = normalizeFunctionSignature;
