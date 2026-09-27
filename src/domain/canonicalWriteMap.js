// Canonical Write Map (Phase 5B)
// Maps suggestion_type → target table and columns for canonical writes.
// Enforces strict whitelisting of allowed write targets.

export const CANONICAL_WRITE_MAP = Object.freeze({
  skill: {
    jobseeker_profile: {
      table: 'jobseeker_skills',
      columns: {
        jobseeker_profile_id: 'entity_id',
        skill_id: 'canonical_id',
        source: () => 'llm_inferred',
      },
      upsert: {
        conflictColumns: ['jobseeker_profile_id', 'skill_id'],
        onConflict: 'DO NOTHING',
      },
    },
    vacancy: {
      table: 'vacancy_skills',
      columns: {
        vacancy_definition_id: 'entity_id',
        skill_id: 'canonical_id',
        importance: 'importance',
      },
      upsert: {
        conflictColumns: ['vacancy_definition_id', 'skill_id'],
        onConflict: 'DO NOTHING',
      },
    },
  },
  certification: {
    jobseeker_profile: {
      table: 'jobseeker_certifications',
      columns: {
        jobseeker_profile_id: 'entity_id',
        certification_id: 'canonical_id',
        source: () => 'llm_inferred',
        verification_status: () => 'unverified',
      },
      requiresExplicitProvenance: true,
    },
    vacancy: {
      table: 'vacancy_certification_requirements',
      columns: {
        vacancy_definition_id: 'entity_id',
        certification_id: 'canonical_id',
        importance: 'importance',
      },
      requiresImportanceCheck: true,
    },
  },
  occupation: {
    jobseeker_profile: {
      table: 'jobseeker_occupation_preferences',
      columns: {
        jobseeker_profile_id: 'entity_id',
        occupation_id: 'canonical_id',
        preference_type: () => 'exploratory',
        source: () => 'llm_inferred',
      },
      upsert: {
        conflictColumns: ['jobseeker_profile_id', 'occupation_id'],
        onConflict: 'DO NOTHING',
      },
      preferenceOnly: true,
    },
    vacancy: {
      table: 'vacancy_definitions',
      updateColumns: {
        occupation_id: 'canonical_id',
      },
    },
  },
  industry: {
    jobseeker_profile: {
      table: 'jobseeker_industry_preferences',
      columns: {
        jobseeker_profile_id: 'entity_id',
        industry_id: 'canonical_id',
        source: () => 'llm_inferred',
      },
      upsert: {
        conflictColumns: ['jobseeker_profile_id', 'industry_id'],
        onConflict: 'DO NOTHING',
      },
      preferenceOnly: true,
    },
    vacancy: {
      table: 'vacancy_definitions',
      updateColumns: {
        industry_id: 'canonical_id',
      },
    },
  },
  education_requirement: {
    vacancy: {
      table: 'vacancy_education_requirements',
      columns: {
        vacancy_definition_id: 'entity_id',
        education_level_id: 'canonical_id',
        importance: 'importance',
      },
      requiresImportanceCheck: true,
    },
  },
  experience_requirement: {
    vacancy: {
      table: 'vacancy_experience_requirements',
      columns: {
        vacancy_definition_id: 'entity_id',
        occupation_id: 'canonical_id',
        minimum_months: 'minimum_months',
        importance: 'importance',
      },
      requiresImportanceCheck: true,
    },
  },
  language: {
    vacancy: {
      table: 'vacancy_language_requirements',
      columns: {
        vacancy_definition_id: 'entity_id',
        language_id: 'canonical_id',
        importance: 'importance',
      },
      upsert: {
        conflictColumns: ['vacancy_definition_id', 'language_id'],
        onConflict: 'DO NOTHING',
      },
      requiresImportanceCheck: true,
    },
  },
})

/**
 * Returns the write target config for a given suggestion type and entity type.
 * @param {string} suggestionType
 * @param {string} entityType
 * @returns {object|null}
 */
export function getWriteTarget(suggestionType, entityType) {
  const typeMap = CANONICAL_WRITE_MAP[suggestionType]
  if (!typeMap) return null
  return typeMap[entityType] || null
}

/**
 * Validates that a suggestion type is allowed for the given entity type.
 * @param {string} suggestionType
 * @param {string} entityType
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function validateWriteTarget(suggestionType, entityType) {
  const target = getWriteTarget(suggestionType, entityType)
  if (!target) {
    return {
      allowed: false,
      reason: `Write not allowed: ${suggestionType} → ${entityType}`,
    }
  }
  return { allowed: true }
}

/**
 * Returns all valid entity types for a given suggestion type.
 * @param {string} suggestionType
 * @returns {string[]}
 */
export function getEntityTypesForSuggestion(suggestionType) {
  const typeMap = CANONICAL_WRITE_MAP[suggestionType]
  if (!typeMap) return []
  return Object.keys(typeMap)
}

/**
 * Returns all valid suggestion types for a given entity type.
 * @param {string} entityType
 * @returns {string[]}
 */
export function getSuggestionTypesForEntity(entityType) {
  const types = []
  for (const [suggestionType, entityMap] of Object.entries(CANONICAL_WRITE_MAP)) {
    if (entityMap[entityType]) types.push(suggestionType)
  }
  return types
}
