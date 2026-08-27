export interface Spec {
  id: string;
  title: string;

  objective: string;

  functionalRequirements: string[];
  nonFunctionalRequirements: string[];

  flow: string;

  acceptanceCriteria: string[];

  endpoints: Endpoint[];

  architecture: string;

  technologies: string[];
}

export interface Endpoint {
  method: string;
  path: string;
  description: string;
}
