const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateApiKey } = require('../middleware/auth');

// Toutes les routes nécessitent l'API key
router.use(authenticateApiKey);

// Validation des données
const validateSettlement = (data) => {
  const errors = [];
  
  // MONTANT est obligatoire selon le modèle Django
  if (!data.MONTANT || isNaN(data.MONTANT)) {
    errors.push('MONTANT is required and must be a valid number');
  }
  
  // Validation des dates si présentes
  const dateFields = ['DATE_CONTRAT', 'DATE_DEBUT', 'DATE_FIN', 'DATE_ASSURANCE', 'DATE_REGLEMENT'];
  dateFields.forEach(field => {
    if (data[field] && !isValidDate(data[field])) {
      errors.push(`${field} must be a valid date (ISO format: YYYY-MM-DDTHH:mm:ssZ)`);
    }
  });
  
  return errors;
};

const isValidDate = (dateString) => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
};

// GET - Récupérer tous les settlements (pour vérification)
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
    console.error('Error fetching settlements:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settlements'
    });
  }
});

// GET - Récupérer un settlement par ID
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
        error: 'Settlement not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching settlement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch settlement'
    });
  }
});

// POST - Insérer un nouveau settlement
router.post('/', async (req, res) => {
  try {
    const settlementData = req.body;
    
    // Validation
    const validationErrors = validateSettlement(settlementData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        errors: validationErrors
      });
    }
    
    // Vérifier que la salle existe si spécifiée
    if (settlementData.id_salle) {
      const salleCheck = await pool.query('SELECT id_salle FROM "API_salle" WHERE id_salle = $1', [settlementData.id_salle]);
      if (salleCheck.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: `Salle with id ${settlementData.id_salle} not found`
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
      settlementData.id_salle || null,
      settlementData.CONTRAT || null,
      settlementData.CLIENT || null,
      settlementData.DATE_CONTRAT || null,
      settlementData.DATE_DEBUT || null,
      settlementData.DATE_FIN || null,
      settlementData.USERC || null,
      settlementData.FAMILLE || null,
      settlementData.SOUSFAMILLE || null,
      settlementData.LIBELLE || null,
      settlementData.DATE_ASSURANCE || null,
      parseFloat(settlementData.MONTANT),
      settlementData.MODE || null,
      settlementData.TARIFAIRE || null,
      settlementData.DATE_REGLEMENT || null
    ];
    
    const result = await pool.query(query, values);
    
    res.status(201).json({
      success: true,
      message: 'Settlement created successfully',
      data: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error creating settlement:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create settlement',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST - Insérer plusieurs settlements en une fois
router.post('/bulk', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { settlements } = req.body;
    
    if (!Array.isArray(settlements) || settlements.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'settlements array is required and must not be empty'
      });
    }
    
    await client.query('BEGIN');
    
    const insertedSettlements = [];
    const errors = [];
    
    for (let i = 0; i < settlements.length; i++) {
      try {
        const settlementData = settlements[i];
        
        // Validation
        const validationErrors = validateSettlement(settlementData);
        if (validationErrors.length > 0) {
          errors.push({
            index: i,
            errors: validationErrors,
            data: settlementData
          });
          continue;
        }
        
        // Vérifier que la salle existe si spécifiée
        if (settlementData.id_salle) {
          const salleCheck = await client.query('SELECT id_salle FROM "API_salle" WHERE id_salle = $1', [settlementData.id_salle]);
          if (salleCheck.rows.length === 0) {
            errors.push({
              index: i,
              errors: [`Salle with id ${settlementData.id_salle} not found`],
              data: settlementData
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
          settlementData.id_salle || null,
          settlementData.CONTRAT || null,
          settlementData.CLIENT || null,
          settlementData.DATE_CONTRAT || null,
          settlementData.DATE_DEBUT || null,
          settlementData.DATE_FIN || null,
          settlementData.USERC || null,
          settlementData.FAMILLE || null,
          settlementData.SOUSFAMILLE || null,
          settlementData.LIBELLE || null,
          settlementData.DATE_ASSURANCE || null,
          parseFloat(settlementData.MONTANT),
          settlementData.MODE || null,
          settlementData.TARIFAIRE || null,
          settlementData.DATE_REGLEMENT || null
        ];
        
        const result = await client.query(query, values);
        insertedSettlements.push(result.rows[0]);
        
      } catch (error) {
        errors.push({
          index: i,
          error: error.message,
          data: settlements[i]
        });
      }
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: `Successfully inserted ${insertedSettlements.length} settlements`,
      inserted: insertedSettlements.length,
      errors: errors.length,
      data: insertedSettlements,
      errorDetails: errors
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in bulk insert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert settlements',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

module.exports = router;