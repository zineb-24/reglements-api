const mysql = require('mysql2/promise');

// Créer un adaptateur qui imite l'interface de pg
const createMySQLAdapter = (connectionString) => {
  // Parser l'URL MySQL : mysql://user:password@host:port/database
  const url = new URL(connectionString);
  
  const pool = mysql.createPool({
    host: url.hostname,
    port: url.port || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1), // Enlever le '/' du début
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+00:00' // UTC pour éviter les problèmes de timezone
  });

  // Fonction pour convertir les dates ISO en format MySQL
  const convertDatesForMySQL = (params) => {
    return params.map(param => {
      if (typeof param === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/.test(param)) {
        // Convertir ISO date en format MySQL DATETIME
        return param.replace('T', ' ').replace('Z', '').substring(0, 19);
      }
      return param;
    });
  };

  // Adapter l'interface pour être compatible avec pg
  return {
    query: async (text, params = []) => {
      try {
        // Convertir les paramètres $1, $2... en ?
        let mysqlQuery = text.replace(/\$(\d+)/g, '?');
        
        // Convertir les guillemets PostgreSQL en backticks MySQL
        mysqlQuery = mysqlQuery.replace(/"/g, '`');
        
        // Convertir les dates pour MySQL
        const convertedParams = convertDatesForMySQL(params);
        
        // Gérer RETURNING pour MySQL
        let isReturning = false;
        let tableName = '';
        
        if (mysqlQuery.includes('RETURNING *')) {
          isReturning = true;
          // Extraire le nom de la table pour MySQL
          const insertMatch = mysqlQuery.match(/INSERT INTO `(\w+)`/i);
          const updateMatch = mysqlQuery.match(/UPDATE `(\w+)`/i);
          
          if (insertMatch) {
            tableName = insertMatch[1];
          } else if (updateMatch) {
            tableName = updateMatch[1];
          }
          
          // Enlever RETURNING * de la requête
          mysqlQuery = mysqlQuery.replace(/\s+RETURNING \*/i, '');
        }
        
        console.log('MySQL Query:', mysqlQuery);
        console.log('MySQL Params (converted):', convertedParams);
        
        const [result] = await pool.query(mysqlQuery, convertedParams);
        
        // Si c'était une requête avec RETURNING, on doit récupérer l'enregistrement
        if (isReturning && result.insertId) {
          // Pour INSERT, récupérer l'enregistrement créé
          const [rows] = await pool.query(`SELECT * FROM \`${tableName}\` WHERE \`ID_reglement\` = ?`, [result.insertId]);
          return {
            rows: rows,
            rowCount: rows.length
          };
        } else if (isReturning && result.affectedRows > 0 && tableName) {
          // Pour UPDATE, on ne peut pas facilement récupérer l'enregistrement modifié
          // On retourne un objet avec les infos basiques
          return {
            rows: [{ affectedRows: result.affectedRows }],
            rowCount: result.affectedRows
          };
        }
        
        // Pour SELECT et autres requêtes
        return {
          rows: Array.isArray(result) ? result : [result],
          rowCount: Array.isArray(result) ? result.length : (result.affectedRows || 0)
        };
        
      } catch (error) {
        console.error('MySQL Error:', error);
        throw error;
      }
    },
    
    connect: async () => {
      const connection = await pool.getConnection();
      
      return {
        query: async (text, params = []) => {
          try {
            let mysqlQuery = text.replace(/\$(\d+)/g, '?');
            mysqlQuery = mysqlQuery.replace(/"/g, '`');
            
            // Convertir les dates pour MySQL
            const convertedParams = convertDatesForMySQL(params);
            
            // Même logique pour RETURNING
            let isReturning = false;
            let tableName = '';
            
            if (mysqlQuery.includes('RETURNING *')) {
              isReturning = true;
              const insertMatch = mysqlQuery.match(/INSERT INTO `(\w+)`/i);
              const updateMatch = mysqlQuery.match(/UPDATE `(\w+)`/i);
              
              if (insertMatch) {
                tableName = insertMatch[1];
              } else if (updateMatch) {
                tableName = updateMatch[1];
              }
              
              mysqlQuery = mysqlQuery.replace(/\s+RETURNING \*/i, '');
            }
            
            const [result] = await connection.query(mysqlQuery, convertedParams);
            
            if (isReturning && result.insertId) {
              const [rows] = await connection.query(`SELECT * FROM \`${tableName}\` WHERE \`ID_reglement\` = ?`, [result.insertId]);
              return {
                rows: rows,
                rowCount: rows.length
              };
            } else if (isReturning && result.affectedRows > 0) {
              return {
                rows: [{ affectedRows: result.affectedRows }],
                rowCount: result.affectedRows
              };
            }
            
            return {
              rows: Array.isArray(result) ? result : [result],
              rowCount: Array.isArray(result) ? result.length : (result.affectedRows || 0)
            };
          } catch (error) {
            throw error;
          }
        },
        release: () => connection.release()
      };
    }
  };
};

module.exports = createMySQLAdapter;