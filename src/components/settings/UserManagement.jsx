import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { UserPlus, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [deletingUser, setDeletingUser] = useState(null);

  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase.functions.invoke('admin-list-users');
    
    if (error) {
      toast({ title: 'Error fetching users', description: error.message, variant: 'destructive' });
      setUsers([]);
    } else if (data.error) {
      toast({ title: 'Error fetching users', description: data.error, variant: 'destructive' });
      setUsers([]);
    } else {
      setUsers(data.users);
    }
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword) {
      toast({ title: 'Missing fields', description: 'Please provide both email and password.', variant: 'destructive' });
      return;
    }
    setIsCreatingUser(true);
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { email: newUserEmail, password: newUserPassword, role: newUserRole },
    });

    if (error) {
      toast({ title: 'Error creating user', description: error.message, variant: 'destructive' });
    } else if (data.error) {
      toast({ title: 'Error from function', description: data.error, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `User ${newUserEmail} created successfully.` });
      setNewUserEmail('');
      setNewUserPassword('');
      fetchUsers();
    }
    setIsCreatingUser(false);
  };
  
  const handleRoleChange = async (userId, newRole) => {
    const { data, error } = await supabase.functions.invoke('admin-update-user', {
      body: { userId, role: newRole }
    });
    if (error) {
      toast({ title: 'Error updating role', description: error.message, variant: 'destructive' });
    } else if (data.error) {
      toast({ title: 'Error from function', description: data.error, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'User role updated.'});
      fetchUsers();
    }
  }

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    const { data, error } = await supabase.functions.invoke('admin-delete-user', {
      body: { userId: deletingUser.id }
    });

    if (error) {
        toast({ title: 'Error deleting user', description: error.message, variant: 'destructive' });
    } else if (data.error) {
      toast({ title: 'Error from function', description: data.error, variant: 'destructive' });
    } else {
        toast({ title: 'Success', description: 'User deleted successfully.' });
        fetchUsers();
    }
    setDeletingUser(null);
  }

  return (
    <>
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Create New User</h3>
      <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input type="email" placeholder="user@example.com" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="bg-input border-border" />
            <Input type="password" placeholder="min. 6 characters" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} className="bg-input border-border" />
          </div>
          <div className="flex items-center gap-4">
            <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} className="bg-input border-border rounded-lg p-2 text-foreground">
                <option value="user">User</option>
                <option value="admin">Admin</option>
            </select>
            <Button type="submit" disabled={isCreatingUser} className="bg-gradient-to-r from-green-500 to-teal-500">
              <UserPlus className="h-4 w-4 mr-2" />
              {isCreatingUser ? 'Creating...' : 'Create User'}
            </Button>
          </div>
      </form>
    </div>
    <div className="space-y-4">
        <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-foreground">Existing Users</h3>
        </div>
        {loadingUsers ? <p>Loading users...</p> : (
            <div className="space-y-2">
                {users && users.length > 0 ? users.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                        <div>
                            <p className="font-medium text-foreground">{user.email}</p>
                            <p className="text-sm text-muted-foreground">Joined: {new Date(user.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <select 
                                value={user.app_metadata.role || 'user'} 
                                onChange={(e) => handleRoleChange(user.id, e.target.value)}
                                className="bg-input border-border rounded-lg p-2 text-foreground"
                            >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                            </select>
                            <Button variant="destructive" size="icon" onClick={() => setDeletingUser(user)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )) : <p>No users found or you do not have permission to view them.</p>}
            </div>
        )}
    </div>
    <AlertDialog open={!!deletingUser} onOpenChange={() => setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the user account for {deletingUser?.email}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">Confirm Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UserManagement;