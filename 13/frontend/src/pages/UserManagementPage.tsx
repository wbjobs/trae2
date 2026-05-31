import { useState, useEffect } from 'react';
import { Plus, Search, Edit3, Trash2, User, Shield, Building2, MoreVertical } from 'lucide-react';
import { userService, departmentService } from '../services';
import { User as UserType } from '@shared/types';

const UserManagementPage = () => {
  const [users, setUsers] = useState<UserType[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState<Partial<UserType> & { password: string }>({
    username: '',
    email: '',
    realName: '',
    password: '',
    role: 'researcher',
    departmentId: ''
  });

  const loadUsers = async () => {
    try {
      const response: any = await userService.list({
        keyword: searchKeyword || undefined,
        role: selectedRole || undefined,
        pageSize: 100
      });
      if (response.success) {
        setUsers(response.data || []);
      }
    } catch (error) {
      console.error('加载用户列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const response: any = await departmentService.list();
      if (response.success) {
        setDepartments(response.data || []);
      }
    } catch (error) {
      console.error('加载部门列表失败:', error);
    }
  };

  useEffect(() => {
    loadUsers();
    loadDepartments();
  }, [searchKeyword, selectedRole]);

  const handleCreateUser = async () => {
    try {
      const response: any = await userService.create(newUser);
      if (response.success) {
        setShowCreateModal(false);
        setNewUser({
          username: '',
          email: '',
          realName: '',
          password: '',
          role: 'researcher',
          departmentId: ''
        });
        loadUsers();
      }
    } catch (error) {
      console.error('创建用户失败:', error);
    }
  };

  const handleToggleStatus = async (user: UserType) => {
    try {
      const newStatus = user.status === 'active' ? 'disabled' : 'active';
      const response: any = await userService.update(user.id, { status: newStatus });
      if (response.success) {
        loadUsers();
      }
    } catch (error) {
      console.error('更新用户状态失败:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (window.confirm('确定要删除此用户吗？')) {
      try {
        await userService.delete(userId);
        loadUsers();
      } catch (error) {
        console.error('删除用户失败:', error);
      }
    }
  };

  const roles = [
    { value: 'admin', label: '系统管理员' },
    { value: 'department_head', label: '部门负责人' },
    { value: 'specimen_admin', label: '标本管理员' },
    { value: 'researcher', label: '科研人员' }
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">用户管理</h1>
          <p className="text-slate-500 mt-1">管理系统用户、角色和权限</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          新建用户
        </button>
      </div>

      <div className="card p-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索用户名、邮箱、姓名..."
              className="input-field pl-10"
            />
          </div>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="input-field w-40"
          >
            <option value="">全部角色</option>
            {roles.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">用户</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">邮箱</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">角色</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">部门</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">状态</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-primary-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{user.realName}</p>
                          <p className="text-sm text-slate-500">@{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`badge ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                        user.role === 'department_head' ? 'bg-blue-100 text-blue-700' :
                        user.role === 'specimen_admin' ? 'bg-green-100 text-green-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {roles.find(r => r.value === user.role)?.label || user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {departments.find(d => d.id === user.departmentId)?.name || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleStatus(user)}
                        className={`badge ${
                          user.status === 'active' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {user.status === 'active' ? '启用' : '禁用'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-6">新建用户</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">用户名</label>
                <input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">真实姓名</label>
                <input
                  type="text"
                  value={newUser.realName}
                  onChange={(e) => setNewUser({ ...newUser, realName: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">初始密码</label>
                <input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">角色</label>
                  <select
                    value={newUser.role || 'researcher'}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserType['role'] })}
                    className="input-field"
                  >
                    {roles.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">部门</label>
                  <select
                    value={newUser.departmentId || ''}
                    onChange={(e) => setNewUser({ ...newUser, departmentId: e.target.value || null })}
                    className="input-field"
                  >
                    <option value="">无</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="btn-secondary"
              >
                取消
              </button>
              <button 
                onClick={handleCreateUser}
                className="btn-primary"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementPage;
