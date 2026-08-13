import { SorobanRpc, Keypair, TransactionBuilder, Networks } from 'stellar-sdk';
import axios, { AxiosInstance } from 'axios';

export interface CircleCreateParams {
  name: string;
  contribution_amount: number;
  cycle_duration_days: number;
  payout_order: 'fixed' | 'bid';
  collateral_percentage: number;
  dispute_window_hours: number;
}

export interface Circle {
  id: string;
  owner: string;
  name: string;
  contribution_amount: number;
  cycle_duration_days: number;
  payout_order: 'fixed' | 'bid';
  collateral_percentage: number;
  dispute_window_hours: number;
  current_round: number;
  is_active: boolean;
  members_count: number;
  created_at: number;
}

export interface Member {
  address: string;
  contributions_made: number;
  payouts_received: number;
  collateral_locked: number;
  default_count: number;
  trust_score: number;
  joined_at: number;
}

export interface CircleFiSDKConfig {
  network: 'testnet' | 'public';
  rpcUrl: string;
  contractId?: string;
  serverUrl?: string;
}

export class CircleFiSDK {
  private rpc: SorobanRpc.Client;
  private http: AxiosInstance;
  private config: CircleFiSDKConfig;
  private contractId: string;

  constructor(config: CircleFiSDKConfig) {
    this.config = config;
    this.rpc = new SorobanRpc.Client({
      allowHttp: true,
      hostname: config.rpcUrl,
    });
    this.contractId = config.contractId || '';
    this.http = axios.create({
      baseURL: config.serverUrl || 'https://api.circlefi.app',
      timeout: 10000,
    });
  }

  /**
   * Create a new savings circle
   */
  async createCircle(params: CircleCreateParams): Promise<Circle> {
    try {
      const response = await this.http.post<Circle>('/circles', {
        ...params,
        payout_order: params.payout_order === 'fixed' ? 0 : 1,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create circle: ${error}`);
    }
  }

  /**
   * Join an existing circle
   */
  async joinCircle(circleId: string): Promise<Circle> {
    try {
      const response = await this.http.post<Circle>(`/circles/${circleId}/join`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to join circle: ${error}`);
    }
  }

  /**
   * Get circle details
   */
  async getCircle(circleId: string): Promise<Circle> {
    try {
      const response = await this.http.get<Circle>(`/circles/${circleId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch circle: ${error}`);
    }
  }

  /**
   * Get all circles for the current user
   */
  async getCircles(): Promise<Circle[]> {
    try {
      const response = await this.http.get<Circle[]>('/circles');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch circles: ${error}`);
    }
  }

  /**
   * Contribute to a circle
   */
  async contribute(circleId: string, amount: number): Promise<{ tx_hash: string }> {
    try {
      const response = await this.http.post(`/circles/${circleId}/contribute`, {
        amount,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to contribute: ${error}`);
    }
  }

  /**
   * Place a bid for payout (bid-based circles only)
   */
  async placeBid(circleId: string, bidAmount: number): Promise<{ tx_hash: string }> {
    try {
      const response = await this.http.post(`/circles/${circleId}/bid`, {
        bid_amount: bidAmount,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to place bid: ${error}`);
    }
  }

  /**
   * Get circle members and their info
   */
  async getMembers(circleId: string): Promise<Member[]> {
    try {
      const response = await this.http.get<Member[]>(`/circles/${circleId}/members`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch members: ${error}`);
    }
  }

  /**
   * Get member info
   */
  async getMember(circleId: string, memberAddress: string): Promise<Member> {
    try {
      const response = await this.http.get<Member>(
        `/circles/${circleId}/members/${memberAddress}`
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch member: ${error}`);
    }
  }

  /**
   * Trigger default for non-paying member
   */
  async triggerDefault(circleId: string, memberAddress: string): Promise<{ tx_hash: string }> {
    try {
      const response = await this.http.post(
        `/circles/${circleId}/members/${memberAddress}/default`
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to trigger default: ${error}`);
    }
  }

  /**
   * Get circle rounds
   */
  async getRounds(circleId: string): Promise<any[]> {
    try {
      const response = await this.http.get(`/circles/${circleId}/rounds`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch rounds: ${error}`);
    }
  }

  /**
   * Dispute a payout
   */
  async disputePayout(circleId: string, roundId: number): Promise<{ tx_hash: string }> {
    try {
      const response = await this.http.post(
        `/circles/${circleId}/rounds/${roundId}/dispute`
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to dispute payout: ${error}`);
    }
  }

  /**
   * End a round
   */
  async endRound(circleId: string): Promise<{ tx_hash: string }> {
    try {
      const response = await this.http.post(`/circles/${circleId}/end-round`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to end round: ${error}`);
    }
  }
}
