const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client - credentials secured in environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event, context) => {
  // Set CORS headers for all responses
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers
    };
  }
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    const { table, operation, filters, data } = JSON.parse(event.body);
    
    if (!table || !operation) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing table or operation' })
      };
    }
    
    let query = supabase.from(table);
    
    // Apply operation based on type
    switch (operation) {
      case 'select':
        query = query.select(data || '*');
        break;
      case 'insert':
        query = query.insert(data);
        break;
      case 'update':
        query = query.update(data);
        break;
      case 'delete':
        query = query.delete();
        break;
      case 'upsert':
        query = query.upsert(data);
        break;
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid operation' })
        };
    }
    
    // Apply filters if provided
    if (filters) {
      if (filters.eq) {
        Object.entries(filters.eq).forEach(([column, value]) => {
          query = query.eq(column, value);
        });
      }
      
      if (filters.neq) {
        Object.entries(filters.neq).forEach(([column, value]) => {
          query = query.neq(column, value);
        });
      }
      
      if (filters.in) {
        Object.entries(filters.in).forEach(([column, values]) => {
          query = query.in(column, values);
        });
      }
      
      if (filters.or) {
        query = query.or(filters.or);
      }
      
      // More filter types can be added as needed
    }
    
    const result = await query;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};