export type RuntimeScalarType = 'integer' | 'string' | 'boolean';

export type RuntimeTypeNode =
  | { type: RuntimeScalarType }
  | { type: 'array'; items: RuntimeScalarType };

export interface RuntimeArgument {
  name: string;
  type: RuntimeScalarType | 'array';
  items?: RuntimeScalarType;
}

export interface AST {
  name: string;
  returnType: RuntimeTypeNode;
  args: RuntimeArgument[];
}

export type NormalizerErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'MISSING_FIELD'
  | 'DUPLICATE_ARG'
  | 'INVALID_SHAPE';

const SCALAR_TYPES: ReadonlySet<RuntimeScalarType> = new Set(['integer', 'string', 'boolean']);
const LEGACY_SCALAR_MAP: Record<string, RuntimeScalarType> = {
  int: 'integer',
  bool: 'boolean',
  string: 'string',
};

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

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new NormalizerError('INVALID_SHAPE', `${path} must be an object`);
  }

  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new NormalizerError('MISSING_FIELD', `${path} must be a non-empty string`);
  }

  return value.trim();
}

function normalizeRuntimeScalar(value: unknown, path: string): RuntimeScalarType {
  if (typeof value !== 'string') {
    throw new NormalizerError('INVALID_SHAPE', `${path} must be a string`);
  }

  if (!SCALAR_TYPES.has(value as RuntimeScalarType)) {
    throw new NormalizerError('UNSUPPORTED_TYPE', `${path} uses unsupported scalar type: ${value}`);
  }

  return value as RuntimeScalarType;
}

function normalizeLegacyScalar(value: unknown, path: string): RuntimeScalarType {
  if (typeof value !== 'string') {
    throw new NormalizerError('INVALID_SHAPE', `${path} must be a string`);
  }

  const mapped = LEGACY_SCALAR_MAP[value];
  if (mapped) {
    return mapped;
  }

  throw new NormalizerError('UNSUPPORTED_TYPE', `${path} uses unsupported legacy scalar type: ${value}`);
}

function normalizeNewTypeNode(value: unknown, path: string): RuntimeTypeNode {
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

function normalizeLegacyTypeNode(value: unknown, path: string): RuntimeTypeNode {
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
      throw new NormalizerError('UNSUPPORTED_TYPE', `${path} uses unsupported legacy kind: ${String(node.kind)}`);
  }
}

function ensureUniqueArgs(args: RuntimeArgument[]): void {
  const seen = new Set<string>();

  for (const arg of args) {
    if (seen.has(arg.name)) {
      throw new NormalizerError('DUPLICATE_ARG', `Duplicate argument name: ${arg.name}`);
    }

    seen.add(arg.name);
  }
}

function normalizeNewArgument(value: unknown, index: number): RuntimeArgument {
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
    throw new NormalizerError('INVALID_SHAPE', `${path}.items is only allowed for array arguments`);
  }

  return {
    name,
    type: normalizeRuntimeScalar(node.type, `${path}.type`),
  };
}

function normalizeLegacyArgument(value: unknown, index: number): RuntimeArgument {
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

function normalizeFromNewShape(rawSignature: Record<string, unknown>): AST {
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

function normalizeFromLegacyShape(rawSignature: Record<string, unknown>): AST {
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

export function normalizeRuntimeSignature(rawSignature: any): AST {
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
