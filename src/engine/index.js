// src/engine/index.js
// Barrel export for all engine functions
const { classifyLead } = require('./classify');
const { calculatePriority } = require('./priority');

module.exports = { classifyLead, calculatePriority };
