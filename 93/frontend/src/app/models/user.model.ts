export interface User {
  id: string;
  username: string;
  realName: string;
  email: string;
  phone: string;
  department: string;
  status: number;
  roles: Role[];
}

export interface Role {
  id: string;
  roleCode: string;
  roleName: string;
  description: string;
  level: number;
  permissions: Permission[];
}

export interface Permission {
  id: string;
  permissionCode: string;
  permissionName: string;
  resourceType: string;
  action: string;
}
