// ADD/REPLACE the content of supabase-client.js with:
let apiClient;

// Initialize the Supabase client
(function() {
  const supabaseUrl = 'https://mczfgzffyyyacisrccqb.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jemZnemZmeXl5YWNpc3JjY3FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgzODYyMDQsImV4cCI6MjA1Mzk2MjIwNH0.rLga_B29Coz1LMeJzFTGLIhckdcojGXnD1ae1bw-QAI';
  
  // Use createClient from Supabase
  apiClient = supabase.createClient(supabaseUrl, anonKey, {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  });
  
  // We need to make supabaseClient globally available for backward compatibility
  window.supabaseClient = apiClient;
})();