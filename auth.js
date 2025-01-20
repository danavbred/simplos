// Basic authentication functions
function toggleAuthForm(type) {
  document.getElementById('login-form').style.display = type === 'login' ? 'flex' : 'none';
  document.getElementById('signup-form').style.display = type === 'signup' ? 'flex' : 'none';
}

async function handleLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  try {
      const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
      });
      
      if (error) throw error;
      
      // User is logged in successfully
      console.log('Logged in:', data);
      showScreen('welcome-screen'); // Return to main game screen
      
  } catch (error) {
      alert('Error logging in: ' + error.message);
  }
}

async function handleSignup() {
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const userType = document.getElementById('user-type').value;
  
  try {
      const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
              data: {
                  user_type: userType
              }
          }
      });
      
      if (error) throw error;
      
      // User is signed up successfully
      alert('Check your email to confirm your account!');
      toggleAuthForm('login');
      
  } catch (error) {
      alert('Error signing up: ' + error.message);
  }
}

// Check if user is already logged in
async function checkUser() {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
      showScreen('welcome-screen');
  } else {
      showScreen('auth-screen');
  }
}