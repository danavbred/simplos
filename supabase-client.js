// supabase-client.js - API wrapper around Netlify Functions
const apiClient = {
    auth: {
      signInWithPassword: async ({ email, password }) => {
        try {
          const response = await fetch('/.netlify/functions/auth', {
            method: 'POST',
            body: JSON.stringify({
              action: 'signIn',
              email,
              password
            })
          });
          
          return await response.json();
        } catch (error) {
          return { data: null, error };
        }
      },
      
      signUp: async ({ email, password, options }) => {
        try {
          const response = await fetch('/.netlify/functions/auth', {
            method: 'POST',
            body: JSON.stringify({
              action: 'signUp',
              email,
              password,
              userData: options?.data
            })
          });
          
          return await response.json();
        } catch (error) {
          return { data: null, error };
        }
      },
      
      signOut: async () => {
        try {
          const response = await fetch('/.netlify/functions/auth', {
            method: 'POST',
            body: JSON.stringify({ action: 'signOut' })
          });
          
          return await response.json();
        } catch (error) {
          return { data: null, error };
        }
      },
      
      getSession: async () => {
        try {
          const response = await fetch('/.netlify/functions/auth', {
            method: 'POST',
            body: JSON.stringify({ action: 'getSession' })
          });
          
          return await response.json();
        } catch (error) {
          return { data: null, error };
        }
      }
    },
    
    from: (table) => {
      return {
        select: async (columns = '*') => {
          try {
            const response = await fetch('/.netlify/functions/db', {
              method: 'POST',
              body: JSON.stringify({
                table,
                operation: 'select',
                data: columns
              })
            });
            
            return await response.json();
          } catch (error) {
            return { data: null, error };
          }
        },
        
        insert: async (data) => {
          try {
            const response = await fetch('/.netlify/functions/db', {
              method: 'POST',
              body: JSON.stringify({
                table,
                operation: 'insert',
                data
              })
            });
            
            return await response.json();
          } catch (error) {
            return { data: null, error };
          }
        },
        
        update: async (data) => {
          try {
            const response = await fetch('/.netlify/functions/db', {
              method: 'POST',
              body: JSON.stringify({
                table,
                operation: 'update',
                data
              })
            });
            
            return await response.json();
          } catch (error) {
            return { data: null, error };
          }
        },
        
        delete: async () => {
          try {
            const response = await fetch('/.netlify/functions/db', {
              method: 'POST',
              body: JSON.stringify({
                table,
                operation: 'delete'
              })
            });
            
            return await response.json();
          } catch (error) {
            return { data: null, error };
          }
        },
        
        upsert: async (data) => {
          try {
            const response = await fetch('/.netlify/functions/db', {
              method: 'POST',
              body: JSON.stringify({
                table,
                operation: 'upsert',
                data
              })
            });
            
            return await response.json();
          } catch (error) {
            return { data: null, error };
          }
        },
        
        // Filter methods that build up the query
        _filters: {},
        
        eq: function(column, value) {
          this._filters = this._filters || {};
          this._filters.eq = this._filters.eq || {};
          this._filters.eq[column] = value;
          return this;
        },
        
        neq: function(column, value) {
          this._filters = this._filters || {};
          this._filters.neq = this._filters.neq || {};
          this._filters.neq[column] = value;
          return this;
        },
        
        in: function(column, values) {
          this._filters = this._filters || {};
          this._filters.in = this._filters.in || {};
          this._filters.in[column] = values;
          return this;
        },
        
        or: function(orString) {
          this._filters = this._filters || {};
          this._filters.or = orString;
          return this;
        }
        
        // Add more query methods as needed
      };
    }
  };