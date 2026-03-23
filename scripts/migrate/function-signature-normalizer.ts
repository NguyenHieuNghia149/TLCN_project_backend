import {
  FunctionArgument,
  FunctionScalarType,
  FunctionSignature,
  FunctionTypeNode,
} from '@backend/shared/types';

export type NormalizerErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'MISSING_FIELD'
  | 'DUPLICATE_ARG'
  | 'INVALID_SHAPE';

const SCALAR_TYPES: ReadonlySet<FunctionScalarType> = new Set(['integer', 'string', 'boolean']);
const LEGACY_SCALAR_MAP: Record<string, FunctionScalarType> = {
  int: 'integer',
  bool: 'boolean',
  string: 'string',
};

/** Describes a validation error while converting legacy signature shapes. */
export class NormalizerError extends Error {
  readonly code: NormalizerErrorCode;

  constructor(code: NormalizerErrorCode, message: string) {
    super(message);
    this.name = 'NormalizerError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Requires a plain object node before deeper signature normalization. */
function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new NormalizerError('INVALID_SHAPE', `${path} must be an object`);
  }

  return value;
}

/** Requires a non-empty string field inside the signature payload. */
function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new NormalizerError('MISSING_FIELD', `${path} must be a non-empty string`);
  }

  return value.trim();
}

/** Normalizes a canonical scalar type node value. */
function normalizeRuntimeScalar(value: unknown, path: string): FunctionScalarType {
  if (typeof value !== 'string') {
    throw new NormalizerError('INVALID_SHAPE', `${path} must be a string`);
  }

  if (!SCALAR_TYPES.has(value as FunctionScalarType)) {
    throw new NormalizerError('UNSUPPORTED_TYPE', `${path} uses unsupported scalar type: ${value}`);
  }

  return value as FunctionScalarType;
}

/** Maps a legacy scalar name into the canonical runtime scalar type. */
function normalizeLegacyScalar(value: unknown, path: string): FunctionScalarType {
  if (typeof value !== 'string') {
    throw new NormalizerError('INVALID_SHAPE', `${path} must be a string`);
  }

  const mapped = LEGACY_SCALAR_MAP[value];
  if (mapped) {
    return mapped;
  }

  throw new NormalizerError(
    'UNSUPPORTED_TYPE',
    `${path} uses unsupported legacy scalar type: ${value}`,
  );
}

/** Normalizes a canonical return type node. */
function normalizeNewTypeNode(value: unknown, path: string): FunctionTypeNode {
  const node = requireRecord(value, path);

  if (!('type' in node)) {
    throw new NormalizerError('MISSING_FIELD', `${path}.type is required`);
  }

  if (node.type === 'array') {
    if (!('items' in node)) {
      throw new NormalizerError('MISSING_FIELD', `${path}.items is required for array types`);
    }

    return {
      type: 'array',
      items: normalizeRuntimeScalar(node.items, `${path}.items`),
    };
  }

  if ('items' in node && node.items !== undefined) {
    throw new NormalizerError('INVALID_SHAPE', `${path}.items is only allowed for array types`);
  }

  return {
    type: normalizeRuntimeScalar(node.type, `${path}.type`),
  };
}

/** Normalizes a legacy return type node into canonical runtime shape. */
function normalizeLegacyTypeNode(value: unknown, path: string): FunctionTypeNode {
  const node = requireRecord(value, path);

  if (!('kind' in node)) {
    throw new NormalizerError('MISSING_FIELD', `${path}.kind is required`);
  }

  switch (node.kind) {
    case 'scalar':
      if (!('name' in node)) {
        throw new NormalizerError('MISSING_FIELD', `${path}.name is required for scalar types`);
      }

      return {
        type: normalizeLegacyScalar(node.name, `${path}.name`),
      };
    case 'array':
      if (!('element' in node)) {
        throw new NormalizerError('MISSING_FIELD', `${path}.element is required for array types`);
      }

      return {
        type: 'array',
        items: normalizeLegacyScalar(node.element, `${path}.element`),
      };
    case 'matrix':
      throw new NormalizerError('UNSUPPORTED_TYPE', `${path} uses unsupported type: matrix`);
    default:
      throw new NormalizerError(
        'UNSUPPORTED_TYPE',
        `${path} uses unsupported legacy kind: ${String(node.kind)}`,
      );
  }
}

/** Rejects duplicate argument names before the signature is persisted. */
function ensureUniqueArgs(args: FunctionArgument[]): void {
  const seen = new Set<string>();

  for (const arg of args) {
    if (seen.has(arg.name)) {
      throw new NormalizerError('DUPLICATE_ARG', `Duplicate argument name: ${arg.name}`);
    }

    seen.add(arg.name);
  }
}

/** Normalizes a canonical function argument node. */
function normalizeNewArgument(value: unknown, index: number): FunctionArgument {
  const path = `signature.args[${index}]`;
  const node = requireRecord(value, path);
  const name = requireString(node.name, `${path}.name`);

  if (!('type' in node)) {
    throw new NormalizerError('MISSING_FIELD', `${path}.type is required`);
  }

  if (node.type === 'array') {
    if (!('items' in node)) {
      throw new NormalizerError('MISSING_FIELD', `${path}.items is required for array arguments`);
    }

    return {
      name,
      type: 'array',
      items: normalizeRuntimeScalar(node.items, `${path}.items`),
    };
  }

  if ('items' in node && node.items !== undefined) {
    throw new NormalizerError(
      'INVALID_SHAPE',
      `${path}.items is only allowed for array arguments`,
    );
  }

  return {
    name,
    type: normalizeRuntimeScalar(node.type, `${path}.type`),
  };
}

/** Normalizes a legacy function argument node into canonical shape. */
function normalizeLegacyArgument(value: unknown, index: number): FunctionArgument {
  const path = `signature.parameters[${index}]`;
  const node = requireRecord(value, path);
  const name = requireString(node.name, `${path}.name`);

  if (!('type' in node)) {
    throw new NormalizerError('MISSING_FIELD', `${path}.type is required`);
  }

  const normalizedType = normalizeLegacyTypeNode(node.type, `${path}.type`);
  if (normalizedType.type === 'array') {
    return {
      name,
      type: 'array',
      items: normalizedType.items,
    };
  }

  return {
    name,
    type: normalizedType.type,
  };
}

/** Normalizes the already-canonical `name/args/returnType` dialect. */
function normalizeFromNewShape(rawSignature: Record<string, unknown>): FunctionSignature {
  const name = requireString(rawSignature.name, 'signature.name');

  if (!('returnType' in rawSignature)) {
    throw new NormalizerError('MISSING_FIELD', 'signature.returnType is required');
  }

  if (!Array.isArray(rawSignature.args)) {
    throw new NormalizerError('MISSING_FIELD', 'signature.args must be an array');
  }

  const args = rawSignature.args.map((arg, index) => normalizeNewArgument(arg, index));
  ensureUniqueArgs(args);

  return {
    name,
    returnType: normalizeNewTypeNode(rawSignature.returnType, 'signature.returnType'),
    args,
  };
}

/** Normalizes the legacy `methodName/parameters` dialect. */
function normalizeFromLegacyShape(rawSignature: Record<string, unknown>): FunctionSignature {
  const name = requireString(rawSignature.methodName, 'signature.methodName');

  if (!('returnType' in rawSignature)) {
    throw new NormalizerError('MISSING_FIELD', 'signature.returnType is required');
  }

  if (!Array.isArray(rawSignature.parameters)) {
    throw new NormalizerError('MISSING_FIELD', 'signature.parameters must be an array');
  }

  const args = rawSignature.parameters.map((arg, index) => normalizeLegacyArgument(arg, index));
  ensureUniqueArgs(args);

  return {
    name,
    returnType: normalizeLegacyTypeNode(rawSignature.returnType, 'signature.returnType'),
    args,
  };
}

/** Converts any supported signature dialect into the canonical runtime `FunctionSignature`. */
export function normalizeRuntimeSignature(rawSignature: unknown): FunctionSignature {
  const signature = requireRecord(rawSignature, 'signature');

  if ('name' in signature && 'args' in signature) {
    return normalizeFromNewShape(signature);
  }

  if ('methodName' in signature && 'parameters' in signature) {
    return normalizeFromLegacyShape(signature);
  }

  throw new NormalizerError(
    'INVALID_SHAPE',
    'signature does not match a supported dialect (expected either name/args or methodName/parameters)',
  );
}
