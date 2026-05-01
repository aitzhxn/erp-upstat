import api from './api';

export interface InstructionListItem {
  id: string;
  title: string;
  postId: string;
  ownerPostId: string;
  status: string;
  version: number;
  updatedAt: string;
}

export interface CreateInstructionData {
  title: string;
  postId: string;
  ownerPostId: string;
  status?: string;
}

export interface InstructionStep {
  id: string;
  instructionId: string;
  title: string;
  text: string | null;
  link: string | null;
  deadline: string | null;
  status: string;
  orderIndex: number;
}

export const instructionsService = {
  getList: async (postId?: string): Promise<InstructionListItem[]> => {
    const params = postId ? { postId } : {};
    const response = await api.get<InstructionListItem[]>('/instructions', { params });
    return response.data;
  },
  getOne: async (id: string): Promise<InstructionListItem> => {
    const response = await api.get<InstructionListItem>(`/instructions/${id}`);
    return response.data;
  },
  getSteps: async (instructionId: string): Promise<InstructionStep[]> => {
    const response = await api.get<InstructionStep[]>(`/instructions/${instructionId}/steps`);
    return response.data;
  },
  createStep: async (instructionId: string, data: { title: string; text?: string; link?: string; deadline?: string; status?: string; orderIndex?: number }): Promise<InstructionStep> => {
    const response = await api.post<InstructionStep>(`/instructions/${instructionId}/steps`, data);
    return response.data;
  },
  create: async (data: CreateInstructionData): Promise<InstructionListItem> => {
    const response = await api.post<InstructionListItem>('/instructions', {
      title: data.title,
      postId: data.postId,
      ownerPostId: data.ownerPostId,
      status: data.status ?? 'draft',
    });
    return response.data;
  },
  deleteStep: async (instructionId: string, stepId: string): Promise<void> => {
    await api.delete(`/instructions/${instructionId}/steps/${stepId}`);
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/instructions/${id}`);
  },
};
