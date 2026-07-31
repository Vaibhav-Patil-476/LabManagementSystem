export interface CurrentUser {
  userId: number;
  role: string;
  franchiseId: number;
  franchiseName: string;
  labId: number;
  permissions: string[];
  raw: any;
}
