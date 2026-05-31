export enum CirculationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  RETURNED = 'RETURNED',
  OVERDUE = 'OVERDUE'
}

export interface CirculationRecord {
  id: string;
  assetId: string;
  assetTitle: string;
  borrowerId: string;
  borrowerName: string;
  borrowPurpose: string;
  borrowDate: Date;
  expectedReturnDate: Date;
  actualReturnDate?: Date;
  status: CirculationStatus;
  approverName: string;
  approvedAt: Date;
  createdAt: Date;
}

export interface CirculationApply {
  assetId: string;
  borrowPurpose: string;
  borrowDate: string;
  expectedReturnDate: string;
}
