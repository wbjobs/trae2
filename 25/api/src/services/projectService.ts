import { projectRepository } from '../repositories/projectRepository.js'
import { projectMemberRepository } from '../repositories/projectMemberRepository.js'
import { imageRepository } from '../repositories/imageRepository.js'
import { userRepository } from '../repositories/userRepository.js'
import type { Project, ProjectMember, RubbingImage, UserRole } from '../types/index.js'

export interface CreateProjectInput {
  name: string
  description?: string
  userId: number
}

export interface UpdateProjectInput {
  name?: string
  description?: string
}

export interface AddMemberInput {
  projectId: number
  userId: number
  role: UserRole
  currentUserId: number
}

export const projectService = {
  getAll(): Project[] {
    return projectRepository.findAll()
  },

  getByUser(userId: number): Project[] {
    return projectRepository.findByUserId(userId)
  },

  getById(id: number, userId?: number): Project | null {
    const project = projectRepository.findById(id)
    if (!project) return null

    if (userId) {
      const isMember = projectMemberRepository.isMember(userId, id)
      if (!isMember && userId !== project.created_by) {
        throw new Error('Access denied: not a project member')
      }
    }

    return project
  },

  create(input: CreateProjectInput): Project {
    if (!input.name) {
      throw new Error('Project name is required')
    }

    const project = projectRepository.create({
      name: input.name,
      description: input.description,
      created_by: input.userId,
    })

    projectMemberRepository.addMember({
      project_id: project.id,
      user_id: input.userId,
      role: 'admin',
    })

    return project
  },

  update(id: number, input: UpdateProjectInput, userId: number): Project | null {
    const project = projectRepository.findById(id)
    if (!project) throw new Error('Project not found')

    if (userId !== project.created_by) {
      const role = projectMemberRepository.getUserRole(userId, id)
      if (role !== 'admin') {
        throw new Error('Access denied: only project admins can update')
      }
    }

    return projectRepository.update(id, input)
  },

  delete(id: number, userId: number): boolean {
    const project = projectRepository.findById(id)
    if (!project) throw new Error('Project not found')

    if (userId !== project.created_by) {
      throw new Error('Access denied: only project creator can delete')
    }

    return projectRepository.delete(id)
  },

  getMembers(projectId: number): ProjectMember[] {
    return projectMemberRepository.findByProject(projectId)
  },

  addMember(input: AddMemberInput): ProjectMember {
    const { projectId, userId, role, currentUserId } = input

    const project = projectRepository.findById(projectId)
    if (!project) throw new Error('Project not found')

    if (currentUserId !== project.created_by) {
      const currentRole = projectMemberRepository.getUserRole(currentUserId, projectId)
      if (currentRole !== 'admin') {
        throw new Error('Access denied: only project admins can add members')
      }
    }

    const user = userRepository.findById(userId)
    if (!user) throw new Error('User not found')

    return projectMemberRepository.addMember({
      project_id: projectId,
      user_id: userId,
      role,
    })
  },

  removeMember(projectId: number, userId: number, currentUserId: number): boolean {
    const project = projectRepository.findById(projectId)
    if (!project) throw new Error('Project not found')

    if (currentUserId !== project.created_by) {
      const currentRole = projectMemberRepository.getUserRole(currentUserId, projectId)
      if (currentRole !== 'admin') {
        throw new Error('Access denied: only project admins can remove members')
      }
    }

    return projectMemberRepository.removeMember(projectId, userId)
  },

  getImages(projectId: number): RubbingImage[] {
    return imageRepository.findByProject(projectId)
  },
}
