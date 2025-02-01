const { createClient } = require('@supabase/supabase-js');

// Replace with YOUR specific details
const supabaseUrl = 'https://simplos.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jemZnemZmeXl5YWNpc3JjY3FiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczODM4NjIwNCwiZXhwIjoyMDUzOTYyMjA0fQ.zr5BNuV9PN0lHqDKcvIQGg6RJI5Yb9s5KHf2plH79qc';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function deleteAllUsers() {
  try {
    // Fetch all users
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing users:', listError);
      return;
    }

    // Delete each user
    for (const user of users.users) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      
      if (error) {
        console.error(`Error deleting user ${user.id}:`, error);
      } else {
        console.log(`Deleted user: ${user.id}`);
      }
    }

    console.log('User deletion process complete');
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

deleteAllUsers();