import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { User } from '@shared/types';

interface OnlineUser {
  userId: string;
  userName: string;
  joinedAt: Date;
  cursor?: { line: number; column: number };
}

interface EditLockInfo {
  userId: string;
  userName: string;
  acquiredAt: Date;
  expiresAt: Date;
}

interface CollaborationState {
  socket: Socket | null;
  currentSpecimenId: string | null;
  onlineUsers: OnlineUser[];
  editLock: EditLockInfo | null;
  isEditing: boolean;
  messageQueue: any[];
  isProcessingQueue: boolean;
  connect: () => void;
  disconnect: () => void;
  joinSpecimen: (specimenId: string, user: User) => void;
  leaveSpecimen: (specimenId: string, user: User) => void;
  setEditLock: (lock: EditLockInfo | null) => void;
  setIsEditing: (editing: boolean) => void;
  setOnlineUsers: (users: OnlineUser[]) => void;
  processMessageQueue: () => void;
  queueMessage: (message: any) => void;
}

const BATCH_INTERVAL = 50;

export const useCollaborationStore = create<CollaborationState>((set, get) => ({
  socket: null,
  currentSpecimenId: null,
  onlineUsers: [],
  editLock: null,
  isEditing: false,
  messageQueue: [],
  isProcessingQueue: false,

  queueMessage: (message) => {
    set((state) => ({
      messageQueue: [...state.messageQueue, message]
    }));
  },

  processMessageQueue: () => {
    const state = get();
    if (state.isProcessingQueue || state.messageQueue.length === 0) return;

    set({ isProcessingQueue: true });

    const queue = [...state.messageQueue];
    set({ messageQueue: [] });

    const latestByType: Record<string, any> = {};
    queue.forEach((msg) => {
      latestByType[msg.type] = msg;
    });

    Object.values(latestByType).forEach((msg) => {
      switch (msg.type) {
        case 'user_joined':
        case 'user_left':
          set({ onlineUsers: msg.data.onlineUsers });
          break;
        case 'specimen_changed':
          window.dispatchEvent(new CustomEvent('specimen-updated', { detail: msg.data }));
          break;
        case 'cursor_updated':
          break;
        case 'edit_started':
        case 'edit_ended':
          break;
        case 'new_annotation':
          window.dispatchEvent(new CustomEvent('new-annotation', { detail: msg.data }));
          break;
      }
    });

    setTimeout(() => {
      set({ isProcessingQueue: false });
      if (get().messageQueue.length > 0) {
        get().processMessageQueue();
      }
    }, BATCH_INTERVAL);
  },

  connect: () => {
    if (get().socket) return;

    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socket.on('connect', () => {
      console.log('[Collaboration] Connected to socket server');
    });

    socket.on('disconnect', () => {
      console.log('[Collaboration] Disconnected from socket server');
    });

    socket.on('user_joined', (data) => {
      get().queueMessage({ type: 'user_joined', data, timestamp: Date.now() });
      get().processMessageQueue();
    });

    socket.on('user_left', (data) => {
      get().queueMessage({ type: 'user_left', data, timestamp: Date.now() });
      get().processMessageQueue();
    });

    socket.on('cursor_updated', (data) => {
      get().queueMessage({ type: 'cursor_updated', data, timestamp: Date.now() });
      get().processMessageQueue();
    });

    socket.on('edit_started', (data) => {
      get().queueMessage({ type: 'edit_started', data, timestamp: Date.now() });
      get().processMessageQueue();
    });

    socket.on('edit_ended', (data) => {
      get().queueMessage({ type: 'edit_ended', data, timestamp: Date.now() });
      get().processMessageQueue();
    });

    socket.on('new_annotation', (data) => {
      get().queueMessage({ type: 'new_annotation', data, timestamp: Date.now() });
      get().processMessageQueue();
    });

    socket.on('specimen_changed', (data) => {
      get().queueMessage({ type: 'specimen_changed', data, timestamp: Date.now() });
      get().processMessageQueue();
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket, currentSpecimenId } = get();
    if (socket && currentSpecimenId) {
      socket.emit('leave_specimen', { specimenId: currentSpecimenId });
    }
    if (socket) {
      socket.disconnect();
    }
    set({ 
      socket: null, 
      currentSpecimenId: null, 
      onlineUsers: [], 
      editLock: null, 
      isEditing: false,
      messageQueue: [],
      isProcessingQueue: false
    });
  },

  joinSpecimen: (specimenId, user) => {
    const { socket } = get();
    if (!socket) return;

    if (get().currentSpecimenId) {
      socket.emit('leave_specimen', { 
        specimenId: get().currentSpecimenId, 
        userId: user.id, 
        userName: user.realName 
      });
    }

    socket.emit('join_specimen', { 
      specimenId, 
      userId: user.id, 
      userName: user.realName 
    });

    set({ currentSpecimenId: specimenId, onlineUsers: [] });
  },

  leaveSpecimen: (specimenId, user) => {
    const { socket } = get();
    if (!socket) return;

    socket.emit('leave_specimen', { 
      specimenId, 
      userId: user.id, 
      userName: user.realName 
    });

    if (get().currentSpecimenId === specimenId) {
      set({ currentSpecimenId: null, onlineUsers: [] });
    }
  },

  setEditLock: (lock) => set({ editLock: lock }),
  setIsEditing: (editing) => set({ isEditing: editing }),
  setOnlineUsers: (users) => set({ onlineUsers: users })
}));
