env.js// env.js - For local development only
if (typeof process === 'undefined') {
  window.process = { env: {} };
}

// This will be replaced by actual environment variables in production
if (typeof process.env.SUPABASE_URL === 'undefined') {
  process.env.SUPABASE_URL = 'https://mczfgzffyyyacisrccqb.supabase.co';
}
if (typeof process.env.SUPABASE_KEY === 'undefined') {
  process.env.SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jemZnemZmeXl5YWNpc3JjY3FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgzODYyMDQsImV4cCI6MjA1Mzk2MjIwNH0.rLga_B29Coz1LMeJzFTGLIhckdcojGXnD1ae1bw-QAI';
}