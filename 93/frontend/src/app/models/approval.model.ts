export enum FlowType {
  ARCHIVE = 'ARCHIVE',
  BORROW = 'BORROW',
  REVOKE = 'REVOKE'
}

export enum NodeType {
  SINGLE = 'SINGLE',
  ALL = 'ALL',
  ANY = 'ANY'
}

export enum InstanceStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export enum ApprovalAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  TRANSFER = 'TRANSFER'
}

export interface ApprovalFlow {
  id: string;
  flowName: string;
  flowType: FlowType;
  description: string;
  createdAt: Date;
  nodes: ApprovalNode[];
}

export interface ApprovalNode {
  id: string;
  nodeOrder: number;
  nodeName: string;
  approverRoleId?: string;
  approverId?: string;
  nodeType: NodeType;
}

export interface ApprovalInstance {
  id: string;
  flowName: string;
  flowType: FlowType;
  assetId: string;
  assetTitle: string;
  initiatorName: string;
  currentNodeName: string;
  currentNodeOrder: number;
  status: InstanceStatus;
  createdAt: Date;
  completedAt?: Date;
  logs: ApprovalLog[];
}

export interface ApprovalLog {
  id: string;
  nodeName: string;
  approverName: string;
  action: ApprovalAction;
  comment: string;
  createdAt: Date;
}

export interface ApprovalSubmit {
  assetId: string;
  flowType: string;
  remark: string;
}

export interface ApprovalProcess {
  instanceId: string;
  action: string;
  comment: string;
}
