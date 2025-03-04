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
    const { action, ...payload } = JSON.parse(event.body);
    let result;
    
    switch (action) {
      case 'signIn':
        result = await supabase.auth.signInWithPassword({
          email: payload.email,
          password: payload.password
        });
        break;
        
      case 'signUp':
        result = await supabase.auth.signUp({
          email: payload.email,
          password: payload.password,
          options: {
            data: payload.userData || {}
          }
        });
        break;
        
      case 'signOut':
        result = await supabase.auth.signOut();
        break;
        
      case 'getSession':
        result = await supabase.auth.getSession();
        break;
        
      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid action' })
        };
    }
    
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