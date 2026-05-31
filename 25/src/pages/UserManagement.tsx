import { useState } from 'react'
import {
  Users,
  User,
  Shield,
  Search,
  MoreVertical,
  Trash2,
  Crown,
  UserCheck,
  UserPlus,
  Eye,
} from 'lucide-react'
import type { User as UserType, UserRole } from '@/lib/types'

const mockUsers: UserType[] = [
  {
    id: 1,
    username: 'admin',
    email: 'admin@guji.com',
    role: 'admin',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    username: 'reviewer01',
    email: 'reviewer01@guji.com',
    role: 'reviewer',
    created_at: '2024-01-05T10:00:00Z',
    updated_at: '2024-01-10T14:00:00Z',
  },
  {
    id: 3,
    username: 'annotator01',
    email: 'annotator01@guji.com',
    role: 'annotator',
    created_at: '2024-01-08T09:00:00Z',
    updated_at: '2024-01-15T11:00:00Z',
  },
  {
    id: 4,
    username: 'viewer01',
    email: 'viewer01@guji.com',
    role: 'viewer',
    created_at: '2024-01-12T15:00:00Z',
    updated_at: '2024-01-12T15:00:00Z',
  },
]

const roleConfig: Record<UserRole, { label: string; icon: typeof User; color: string }> = {
  admin: { label: '管理员', icon: Crown, color: 'text-cinnabar bg-cinnabar-50 border-cinnabar-200' },
  reviewer: { label: '审核员', icon: UserCheck, color: 'text-bronze bg-bronze-50 border-bronze-200' },
  annotator: { label: '标注员', icon: User, color: 'text-ink bg-ink-50 border-ink-200' },
  viewer: { label: '查看者', icon: Eye, color: 'text-ink-600 bg-ink-50 border-ink-200' },
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserType[]>(mockUsers)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null)
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  const filteredUsers = users.filter((user) => {
    if (roleFilter !== 'all' && user.role !== roleFilter) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        user.username.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      )
    }
    return true
  })

  const handleRoleChange = (userId: number, newRole: UserRole) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? { ...u, role: newRole, updated_at: new Date().toISOString() }
          : u
      )
    )
    setEditingUserId(null)
    setMenuOpenId(null)
  }

  const handleDelete = (userId: number) => {
    const user = users.find((u) => u.id === userId)
    if (!user) return
    if (!confirm(`确定要删除用户 "${user.username}" 吗？`)) return
    setUsers((prev) => prev.filter((u) => u.id !== userId))
    setMenuOpenId(null)
  }

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === 'admin').length,
    reviewers: users.filter((u) => u.role === 'reviewer').length,
    annotators: users.filter((u) => u.role === 'annotator').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="chinese-title text-2xl font-bold text-ink">用户管理</h2>
          <p className="text-ink-400 text-sm mt-1">管理平台用户和权限</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-ink text-rice rounded-lg hover:bg-ink-700 transition-colors shadow-md"
        >
          <UserPlus className="w-5 h-5" />
          添加用户
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-rice p-4">
          <p className="text-2xl font-bold text-ink">{stats.total}</p>
          <p className="text-xs text-ink-400">用户总数</p>
        </div>
        <div className="card-rice p-4 border-l-4 border-cinnabar">
          <p className="text-2xl font-bold text-cinnabar">{stats.admins}</p>
          <p className="text-xs text-ink-400">管理员</p>
        </div>
        <div className="card-rice p-4 border-l-4 border-bronze">
          <p className="text-2xl font-bold text-bronze">{stats.reviewers}</p>
          <p className="text-xs text-ink-400">审核员</p>
        </div>
        <div className="card-rice p-4 border-l-4 border-ink">
          <p className="text-2xl font-bold text-ink">{stats.annotators}</p>
          <p className="text-xs text-ink-400">标注员</p>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-300" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索用户..."
            className="input-ink pl-10"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'admin', 'reviewer', 'annotator', 'viewer'] as const).map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                roleFilter === role
                  ? 'bg-ink text-rice'
                  : 'bg-rice text-ink-400 hover:bg-ink-50 border border-ink-100'
              }`}
            >
              {role === 'all' ? '全部' : roleConfig[role].label}
            </button>
          ))}
        </div>
      </div>

      <div className="card-rice overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-ink-50 border-b border-ink-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-400 uppercase tracking-wider">
                  用户
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-400 uppercase tracking-wider">
                  邮箱
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-400 uppercase tracking-wider">
                  角色
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-400 uppercase tracking-wider">
                  创建时间
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-ink-400 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filteredUsers.map((user) => {
                const role = roleConfig[user.role]
                return (
                  <tr key={user.id} className="hover:bg-ink-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-ink-100 rounded-full flex items-center justify-center">
                          <role.icon className="w-5 h-5 text-ink-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {user.username}
                          </p>
                          <p className="text-xs text-ink-400">@{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-ink-600">{user.email}</span>
                    </td>
                    <td className="px-4 py-3">
                      {editingUserId === user.id ? (
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleRoleChange(user.id, e.target.value as UserRole)
                          }
                          onBlur={() => setEditingUserId(null)}
                          className="input-ink py-1 text-sm"
                          autoFocus
                        >
                          <option value="annotator">标注员</option>
                          <option value="viewer">查看者</option>
                          <option value="reviewer">审核员</option>
                          <option value="admin">管理员</option>
                        </select>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${role.color}`}
                        >
                          <role.icon className="w-3 h-3" />
                          {role.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-ink-400">
                        {new Date(user.created_at).toLocaleDateString('zh-CN')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block">
                        <button
                          onClick={() =>
                            setMenuOpenId(menuOpenId === user.id ? null : user.id)
                          }
                          className="p-1.5 hover:bg-ink-100 rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-4 h-4 text-ink-400" />
                        </button>
                        {menuOpenId === user.id && (
                          <div className="absolute right-0 top-full mt-1 w-36 bg-rice border border-ink-100 rounded-lg shadow-lg z-10 py-1">
                            <button
                              onClick={() => {
                                setEditingUserId(user.id)
                                setMenuOpenId(null)
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink hover:bg-ink-50"
                            >
                              <Shield className="w-4 h-4" />
                              修改角色
                            </button>
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-cinnabar hover:bg-cinnabar-50"
                              disabled={user.role === 'admin'}
                            >
                              <Trash2 className="w-4 h-4" />
                              删除
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-ink-300">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>暂无用户</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-ink-700/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-rice rounded-xl shadow-2xl w-full max-w-md animate-slide-up">
            <div className="p-6 border-b border-ink-100">
              <h3 className="chinese-title text-xl font-bold text-ink">添加用户</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  用户名
                </label>
                <input type="text" className="input-ink" placeholder="请输入用户名" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  邮箱
                </label>
                <input type="email" className="input-ink" placeholder="请输入邮箱" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  角色
                </label>
                <select className="input-ink">
                  <option value="annotator">标注员</option>
                  <option value="viewer">查看者</option>
                  <option value="reviewer">审核员</option>
                  <option value="admin">管理员</option>
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 btn-outline-ink"
                >
                  取消
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 btn-ink"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
