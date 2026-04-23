// src/engine/resolveNode.js
// Merge a base node with a tenant override.
// Pure function — no DB access, no side effects.

/**
 * Resolve a node by merging base with override.
 * Override can partially replace: mensagem, opcoes, config.
 * Never replaces: tipo, estado, ordem.
 *
 * @param {object} baseNode - node from template or DB
 * @param {object|null} override - FlowOverride record (or null)
 * @returns {object} resolved node
 */
function resolveNode(baseNode, override) {
  if (!override || !override.overrides) return baseNode;

  const ov = override.overrides;

  return {
    ...baseNode,
    // Overridable fields
    mensagem: ov.mensagem !== undefined ? ov.mensagem : baseNode.mensagem,
    opcoes: ov.opcoes !== undefined ? ov.opcoes : baseNode.opcoes,
    // Config: deep merge (base config + override config)
    config: baseNode.config || ov.config
      ? { ...(baseNode.config || {}), ...(ov.config || {}) }
      : undefined,
    // Never override these
    // tipo, estado, ordem stay from baseNode
  };
}

/**
 * Resolve all nodes in a flow by applying overrides.
 *
 * @param {Array} baseNodes - array of base nodes
 * @param {Array} overrides - array of FlowOverride records
 * @returns {Array} resolved nodes
 */
function resolveFlow(baseNodes, overrides) {
  if (!overrides || overrides.length === 0) return baseNodes;

  const overrideMap = new Map();
  for (const ov of overrides) {
    overrideMap.set(ov.nodeEstado, ov);
  }

  return baseNodes.map(node => resolveNode(node, overrideMap.get(node.estado)));
}

module.exports = { resolveNode, resolveFlow };
