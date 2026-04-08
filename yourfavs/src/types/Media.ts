export interface CastMember {
    name: string;
    character: string;
    id: number;
    profile_path?: string;
}

export interface Provider {
    provider_id: number;
    provider_name: string;
    logo_path: string;
    type?: 'flatrate' | 'rent' | 'buy';
}

export interface ProductionCompany {
    id: number;
    name: string;
    logo_path?: string;
    origin_country?: string;
}

export interface GuestStar {
    id: number;
    name: string;
    character: string;
    profile_path?: string;
}
