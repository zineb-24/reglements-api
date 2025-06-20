const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateApiKey } = require('../middleware/auth');

// Toutes les routes nécessitent l'API key
router.use(authenticateApiKey);

// Validation des données
const validateReglement = (data) => {
  const errors = [];
  
  // Champs obligatoires
  if (!data.MONTANT || isNaN(data.MONTANT)) {
    errors.push('MONTANT is required and must be a valid number');
  }
  
  if (!data.CLIENT || data.CLIENT.trim() === '') {
    errors.push('CLIENT is required and cannot be empty');
  }
  
  if (!data.CONTRAT || data.CONTRAT.trim() === '') {
    errors.push('CONTRAT is required and cannot be empty');
  }
  
  if (!data.USERC || data.USERC.trim() === '') {
    errors.push('USERC (Agent) is required and cannot be empty');
  }
  
  if (!data.FAMILLE || data.FAMILLE.trim() === '') {
    errors.push('FAMILLE is required and cannot be empty');
  }
  
  if (!data.SOUSFAMILLE || data.SOUSFAMILLE.trim() === '') {
    errors.push('SOUSFAMILLE (Sub-family) is required and cannot be empty');
  }
  
  if (!data.LIBELLE || data.LIBELLE.trim() === '') {
    errors.push('LIBELLE (Label) is required and cannot be empty');
  }
  
  if (!data.MODE || data.MODE.trim() === '') {
    errors.push('MODE (Payment Method) is required and cannot be empty');
  }
  
  if (!data.TARIFAIRE || data.TARIFAIRE.trim() === '') {
    errors.push('TARIFAIRE (Rate) is required and cannot be empty');
  }
  
  // Dates obligatoires
  if (!data.DATE_CONTRAT) {
    errors.push('DATE_CONTRAT is required');
  } else if (!isValidDate(data.DATE_CONTRAT)) {
    errors.push('DATE_CONTRAT must be a valid date (ISO format: YYYY-MM-DDTHH:mm:ssZ)');
  }
  
  if (!data.DATE_DEBUT) {
    errors.push('DATE_DEBUT is required');
  } else if (!isValidDate(data.DATE_DEBUT)) {
    errors.push('DATE_DEBUT must be a valid date (ISO format: YYYY-MM-DDTHH:mm:ssZ)');
  }
  
  if (!data.DATE_FIN) {
    errors.push('DATE_FIN is required');
  } else if (!isValidDate(data.DATE_FIN)) {
    errors.push('DATE_FIN must be a valid date (ISO format: YYYY-MM-DDTHH:mm:ssZ)');
  }
  
  if (!data.DATE_ASSURANCE) {
    errors.push('DATE_ASSURANCE is required');
  } else if (!isValidDate(data.DATE_ASSURANCE)) {
    errors.push('DATE_ASSURANCE must be a valid date (ISO format: YYYY-MM-DDTHH:mm:ssZ)');
  }
  
  if (!data.DATE_REGLEMENT) {
    errors.push('DATE_REGLEMENT is required');
  } else if (!isValidDate(data.DATE_REGLEMENT)) {
    errors.push('DATE_REGLEMENT must be a valid date (ISO format: YYYY-MM-DDTHH:mm:ssZ)');
  }
  
  // id_salle est obligatoire
  if (!data.id_salle || isNaN(data.id_salle)) {
    errors.push('id_salle is required and must be a valid number');
  }
  
  return errors;
};

const isValidDate = (dateString) => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

// GET - Récupérer tous les reglements (pour vérification)
router.get('/', async (req, res) => {
  try {
    const limit = req.query.limit || 100;
    const result = await pool.query(`
      SELECT r.*, s.name as salle_name 
      FROM "API_user_reglement" r 
      LEFT JOIN "API_salle" s ON r.id_salle_id = s.id_salle 
      ORDER BY r."ID_reglement" DESC 
      LIMIT $1
    `, [limit]);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    console.error('Error fetching reglements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reglements'
    });
  }
});

// GET - Récupérer un reglement par ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT r.*, s.name as salle_name 
      FROM "API_user_reglement" r 
      LEFT JOIN "API_salle" s ON r.id_salle_id = s.id_salle 
      WHERE r."ID_reglement" = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reglement not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching reglement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reglement'
    });
  }
});

// POST - Insérer un nouveau reglement
router.post('/', async (req, res) => {
  try {
    const reglementData = req.body;
    
    // Validation
    const validationErrors = validateReglement(reglementData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors
      });
    }
    
    // Vérifier que la salle existe si spécifiée
    if (reglementData.id_salle) {
      const salleCheck = await pool.query('SELECT id_salle FROM "API_salle" WHERE id_salle = $1', [reglementData.id_salle]);
      if (salleCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: `Salle with id ${reglementData.id_salle} not found`
        });
      }
    }
    
    const query = `
      INSERT INTO "API_user_reglement" (
        "id_salle_id", "CONTRAT", "CLIENT", "DATE_CONTRAT", "DATE_DEBUT", 
        "DATE_FIN", "USERC", "FAMILLE", "SOUSFAMILLE", "LIBELLE", 
        "DATE_ASSURANCE", "MONTANT", "MODE", "TARIFAIRE", "DATE_REGLEMENT"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
    
    const values = [
      parseInt(reglementData.id_salle),
      reglementData.CONTRAT.trim(),
      reglementData.CLIENT.trim(),
      reglementData.DATE_CONTRAT,
      reglementData.DATE_DEBUT,
      reglementData.DATE_FIN,
      reglementData.USERC.trim(),
      reglementData.FAMILLE.trim(),
      reglementData.SOUSFAMILLE.trim(),
      reglementData.LIBELLE.trim(),
      reglementData.DATE_ASSURANCE,
      parseFloat(reglementData.MONTANT),
      reglementData.MODE.trim(),
      reglementData.TARIFAIRE.trim(),
      reglementData.DATE_REGLEMENT
    ];
    
    const result = await pool.query(query, values);
    
    res.status(201).json({
      success: true,
      message: 'Reglement created successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error creating reglement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create reglement',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST - Insérer plusieurs reglements en une fois
router.post('/bulk', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { reglements } = req.body;
    
    if (!Array.isArray(reglements) || reglements.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'reglements array is required and must not be empty'
      });
    }
    
    await client.query('BEGIN');
    
    const insertedReglements = [];
    const errors = [];
    
    for (let i = 0; i < reglements.length; i++) {
      try {
        const reglementData = reglements[i];
        
        // Validation
        const validationErrors = validateReglement(reglementData);
        if (validationErrors.length > 0) {
          errors.push({
            index: i,
            errors: validationErrors,
            data: reglementData
          });
          continue;
        }
        
        // Vérifier que la salle existe si spécifiée
        if (reglementData.id_salle) {
          const salleCheck = await client.query('SELECT id_salle FROM "API_salle" WHERE id_salle = $1', [reglementData.id_salle]);
          if (salleCheck.rows.length === 0) {
            errors.push({
              index: i,
              errors: [`Salle with id ${reglementData.id_salle} not found`],
              data: reglementData
            });
            continue;
          }
        }
        
        const query = `
          INSERT INTO "API_user_reglement" (
            "id_salle_id", "CONTRAT", "CLIENT", "DATE_CONTRAT", "DATE_DEBUT", 
            "DATE_FIN", "USERC", "FAMILLE", "SOUSFAMILLE", "LIBELLE", 
            "DATE_ASSURANCE", "MONTANT", "MODE", "TARIFAIRE", "DATE_REGLEMENT"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *
        `;
        
        const values = [
          parseInt(reglementData.id_salle),
          reglementData.CONTRAT.trim(),
          reglementData.CLIENT.trim(),
          reglementData.DATE_CONTRAT,
          reglementData.DATE_DEBUT,
          reglementData.DATE_FIN,
          reglementData.USERC.trim(),
          reglementData.FAMILLE.trim(),
          reglementData.SOUSFAMILLE.trim(),
          reglementData.LIBELLE.trim(),
          reglementData.DATE_ASSURANCE,
          parseFloat(reglementData.MONTANT),
          reglementData.MODE.trim(),
          reglementData.TARIFAIRE.trim(),
          reglementData.DATE_REGLEMENT
        ];
        
        const result = await client.query(query, values);
        insertedReglements.push(result.rows[0]);
        
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          data: reglements[i]
        });
      }
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: `Successfully inserted ${insertedReglements.length} reglements`,
      inserted: insertedReglements.length,
      errors: errors.length,
      data: insertedReglements,
      errorDetails: errors
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in bulk insert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert reglements',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

// PATCH - Modifier partiellement un reglement (un ou plusieurs champs)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Vérifier que le reglement existe
    const existingReglement = await pool.query('SELECT * FROM "API_user_reglement" WHERE "ID_reglement" = $1', [id]);
    if (existingReglement.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reglement not found'
      });
    }
    
    // Vérifier qu'il y a au moins un champ à modifier
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one field must be provided for update'
      });
    }
    
    // Liste des champs autorisés à être modifiés
    const allowedFields = [
      'id_salle', 'CONTRAT', 'CLIENT', 'DATE_CONTRAT', 'DATE_DEBUT', 
      'DATE_FIN', 'USERC', 'FAMILLE', 'SOUSFAMILLE', 'LIBELLE', 
      'DATE_ASSURANCE', 'MONTANT', 'MODE', 'TARIFAIRE', 'DATE_REGLEMENT'
    ];
    
    // Filtrer les champs autorisés et valider
    const fieldsToUpdate = {};
    const validationErrors = [];
    
    for (const [key, value] of Object.entries(updateData)) {
      if (!allowedFields.includes(key)) {
        validationErrors.push(`Field '${key}' is not allowed to be updated`);
        continue;
      }
      
      // Validation spécifique par champ
      switch (key) {
        case 'MONTANT':
          if (value !== null && value !== undefined && isNaN(value)) {
            validationErrors.push('MONTANT must be a valid number');
          } else if (value !== null && value !== undefined) {
            fieldsToUpdate[key] = parseFloat(value);
          }
          break;
          
        case 'id_salle':
          if (value !== null && value !== undefined && isNaN(value)) {
            validationErrors.push('id_salle must be a valid number');
          } else if (value !== null && value !== undefined) {
            // Vérifier que la salle existe
            const salleCheck = await pool.query('SELECT id_salle FROM "API_salle" WHERE id_salle = $1', [value]);
            if (salleCheck.rows.length === 0) {
              validationErrors.push(`Salle with id ${value} not found`);
            } else {
              fieldsToUpdate[key] = parseInt(value);
            }
          }
          break;
          
        case 'DATE_CONTRAT':
        case 'DATE_DEBUT':
        case 'DATE_FIN':
        case 'DATE_ASSURANCE':
        case 'DATE_REGLEMENT':
          if (value !== null && value !== undefined && !isValidDate(value)) {
            validationErrors.push(`${key} must be a valid date (ISO format: YYYY-MM-DDTHH:mm:ssZ)`);
          } else {
            fieldsToUpdate[key] = value;
          }
          break;
          
        case 'CONTRAT':
        case 'CLIENT':
        case 'USERC':
        case 'FAMILLE':
        case 'SOUSFAMILLE':
        case 'LIBELLE':
        case 'MODE':
        case 'TARIFAIRE':
          if (value !== null && value !== undefined) {
            const trimmedValue = value.toString().trim();
            if (trimmedValue === '') {
              validationErrors.push(`${key} cannot be empty`);
            } else {
              fieldsToUpdate[key] = trimmedValue;
            }
          }
          break;
          
        default:
          fieldsToUpdate[key] = value;
      }
    }
    
    // Retourner les erreurs de validation si il y en a
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors
      });
    }
    
    // Vérifier qu'il reste des champs à modifier après validation
    if (Object.keys(fieldsToUpdate).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields provided for update'
      });
    }
    
    // Construire la requête UPDATE dynamiquement
    const setParts = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(fieldsToUpdate)) {
      // Mapper les noms de champs aux colonnes de la base
      const columnName = key === 'id_salle' ? 'id_salle_id' : key;
      setParts.push(`"${columnName}" = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
    
    // Ajouter l'ID pour la clause WHERE
    values.push(id);
    
    const query = `
      UPDATE "API_user_reglement" 
      SET ${setParts.join(', ')}
      WHERE "ID_reglement" = $${paramIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      message: 'Reglement updated successfully',
      data: result.rows[0],
      previous: existingReglement.rows[0],
      updatedFields: Object.keys(fieldsToUpdate)
    });
    
  } catch (error) {
    console.error('Error updating reglement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update reglement',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH - Modifier partiellement plusieurs reglements en une fois
router.patch('/bulk/update', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { updates } = req.body;
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'updates array is required and must not be empty'
      });
    }
    
    // Vérifier que chaque update a un ID
    for (let i = 0; i < updates.length; i++) {
      if (!updates[i].id || isNaN(parseInt(updates[i].id))) {
        return res.status(400).json({
          success: false,
          error: `Update at index ${i} must have a valid numeric id`
        });
      }
    }
    
    await client.query('BEGIN');
    
    const updatedReglements = [];
    const errors = [];
    
    const allowedFields = [
      'id_salle', 'CONTRAT', 'CLIENT', 'DATE_CONTRAT', 'DATE_DEBUT', 
      'DATE_FIN', 'USERC', 'FAMILLE', 'SOUSFAMILLE', 'LIBELLE', 
      'DATE_ASSURANCE', 'MONTANT', 'MODE', 'TARIFAIRE', 'DATE_REGLEMENT'
    ];
    
    for (let i = 0; i < updates.length; i++) {
      try {
        const { id, ...updateData } = updates[i];
        
        // Vérifier que le reglement existe
        const existingReglement = await client.query('SELECT * FROM "API_user_reglement" WHERE "ID_reglement" = $1', [id]);
        if (existingReglement.rows.length === 0) {
          errors.push({
            index: i,
            id: id,
            error: 'Reglement not found'
          });
          continue;
        }
        
        // Vérifier qu'il y a au moins un champ à modifier
        if (Object.keys(updateData).length === 0) {
          errors.push({
            index: i,
            id: id,
            error: 'At least one field must be provided for update'
          });
          continue;
        }
        
        // Filtrer et valider les champs
        const fieldsToUpdate = {};
        const validationErrors = [];
        
        for (const [key, value] of Object.entries(updateData)) {
          if (!allowedFields.includes(key)) {
            validationErrors.push(`Field '${key}' is not allowed to be updated`);
            continue;
          }
          
          // Validation spécifique par champ (même logique que la route PATCH simple)
          switch (key) {
            case 'MONTANT':
              if (value !== null && value !== undefined && isNaN(value)) {
                validationErrors.push('MONTANT must be a valid number');
              } else if (value !== null && value !== undefined) {
                fieldsToUpdate[key] = parseFloat(value);
              }
              break;
              
            case 'id_salle':
              if (value !== null && value !== undefined && isNaN(value)) {
                validationErrors.push('id_salle must be a valid number');
              } else if (value !== null && value !== undefined) {
                const salleCheck = await client.query('SELECT id_salle FROM "API_salle" WHERE id_salle = $1', [value]);
                if (salleCheck.rows.length === 0) {
                  validationErrors.push(`Salle with id ${value} not found`);
                } else {
                  fieldsToUpdate[key] = parseInt(value);
                }
              }
              break;
              
            case 'DATE_CONTRAT':
            case 'DATE_DEBUT':
            case 'DATE_FIN':
            case 'DATE_ASSURANCE':
            case 'DATE_REGLEMENT':
              if (value !== null && value !== undefined && !isValidDate(value)) {
                validationErrors.push(`${key} must be a valid date (ISO format: YYYY-MM-DDTHH:mm:ssZ)`);
              } else {
                fieldsToUpdate[key] = value;
              }
              break;
              
            case 'CONTRAT':
            case 'CLIENT':
            case 'USERC':
            case 'FAMILLE':
            case 'SOUSFAMILLE':
            case 'LIBELLE':
            case 'MODE':
            case 'TARIFAIRE':
              if (value !== null && value !== undefined) {
                const trimmedValue = value.toString().trim();
                if (trimmedValue === '') {
                  validationErrors.push(`${key} cannot be empty`);
                } else {
                  fieldsToUpdate[key] = trimmedValue;
                }
              }
              break;
              
            default:
              fieldsToUpdate[key] = value;
          }
        }
        
        if (validationErrors.length > 0) {
          errors.push({
            index: i,
            id: id,
            errors: validationErrors
          });
          continue;
        }
        
        if (Object.keys(fieldsToUpdate).length === 0) {
          errors.push({
            index: i,
            id: id,
            error: 'No valid fields provided for update'
          });
          continue;
        }
        
        // Construire et exécuter la requête UPDATE
        const setParts = [];
        const values = [];
        let paramIndex = 1;
        
        for (const [key, value] of Object.entries(fieldsToUpdate)) {
          const columnName = key === 'id_salle' ? 'id_salle_id' : key;
          setParts.push(`"${columnName}" = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
        
        values.push(id);
        
        const query = `
          UPDATE "API_user_reglement" 
          SET ${setParts.join(', ')}
          WHERE "ID_reglement" = $${paramIndex}
          RETURNING *
        `;
        
        const result = await client.query(query, values);
        updatedReglements.push({
          ...result.rows[0],
          updatedFields: Object.keys(fieldsToUpdate)
        });
        
      } catch (error) {
        errors.push({
          index: i,
          id: updates[i].id,
          error: error.message
        });
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Successfully updated ${updatedReglements.length} reglements`,
      updated: updatedReglements.length,
      errors: errors.length,
      data: updatedReglements,
      errorDetails: errors
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in bulk patch:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update reglements',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

// PUT - Modifier un reglement
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const reglementData = req.body;
    
    // Vérifier que le reglement existe
    const existingReglement = await pool.query('SELECT * FROM "API_user_reglement" WHERE "ID_reglement" = $1', [id]);
    if (existingReglement.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reglement not found'
      });
    }
    
    // Validation
    const validationErrors = validateReglement(reglementData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors
      });
    }
    
    // Vérifier que la salle existe si spécifiée
    if (reglementData.id_salle) {
      const salleCheck = await pool.query('SELECT id_salle FROM "API_salle" WHERE id_salle = $1', [reglementData.id_salle]);
      if (salleCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: `Salle with id ${reglementData.id_salle} not found`
        });
      }
    }
    
    const query = `
      UPDATE "API_user_reglement" SET
        "id_salle_id" = $1,
        "CONTRAT" = $2,
        "CLIENT" = $3,
        "DATE_CONTRAT" = $4,
        "DATE_DEBUT" = $5,
        "DATE_FIN" = $6,
        "USERC" = $7,
        "FAMILLE" = $8,
        "SOUSFAMILLE" = $9,
        "LIBELLE" = $10,
        "DATE_ASSURANCE" = $11,
        "MONTANT" = $12,
        "MODE" = $13,
        "TARIFAIRE" = $14,
        "DATE_REGLEMENT" = $15
      WHERE "ID_reglement" = $16
      RETURNING *
    `;
    
    const values = [
      parseInt(reglementData.id_salle),
      reglementData.CONTRAT.trim(),
      reglementData.CLIENT.trim(),
      reglementData.DATE_CONTRAT,
      reglementData.DATE_DEBUT,
      reglementData.DATE_FIN,
      reglementData.USERC.trim(),
      reglementData.FAMILLE.trim(),
      reglementData.SOUSFAMILLE.trim(),
      reglementData.LIBELLE.trim(),
      reglementData.DATE_ASSURANCE,
      parseFloat(reglementData.MONTANT),
      reglementData.MODE.trim(),
      reglementData.TARIFAIRE.trim(),
      reglementData.DATE_REGLEMENT,
      id
    ];
    
    const result = await pool.query(query, values);
    
    res.json({
      success: true,
      message: 'Reglement updated successfully',
      data: result.rows[0],
      previous: existingReglement.rows[0]
    });
    
  } catch (error) {
    console.error('Error updating reglement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update reglement',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE - Supprimer un reglement
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier que le reglement existe avant de le supprimer
    const existingReglement = await pool.query('SELECT * FROM "API_user_reglement" WHERE "ID_reglement" = $1', [id]);
    if (existingReglement.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Reglement not found'
      });
    }
    
    const result = await pool.query('DELETE FROM "API_user_reglement" WHERE "ID_reglement" = $1 RETURNING *', [id]);
    
    res.json({
      success: true,
      message: 'Reglement deleted successfully',
      deleted: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error deleting reglement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete reglement',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE - Supprimer plusieurs reglements en une fois
router.delete('/bulk/delete', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ids array is required and must not be empty'
      });
    }
    
    // Valider que tous les IDs sont des nombres
    const invalidIds = ids.filter(id => isNaN(parseInt(id)));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'All IDs must be valid numbers',
        invalidIds
      });
    }
    
    await client.query('BEGIN');
    
    const deletedReglements = [];
    const notFoundIds = [];
    
    for (const id of ids) {
      try {
        // Vérifier que le reglement existe
        const existingReglement = await client.query('SELECT * FROM "API_user_reglement" WHERE "ID_reglement" = $1', [id]);
        
        if (existingReglement.rows.length === 0) {
          notFoundIds.push(id);
          continue;
        }
        
        // Supprimer le reglement
        const result = await client.query('DELETE FROM "API_user_reglement" WHERE "ID_reglement" = $1 RETURNING *', [id]);
        deletedReglements.push(result.rows[0]);
        
      } catch (error) {
        console.error(`Error deleting reglement ${id}:`, error);
        notFoundIds.push(id);
      }
    }
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Successfully deleted ${deletedReglements.length} reglements`,
      deleted: deletedReglements.length,
      notFound: notFoundIds.length,
      deletedReglements,
      notFoundIds
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in bulk delete:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete reglements',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

module.exports = router;