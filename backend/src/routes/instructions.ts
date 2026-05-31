import { Router } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  getInstructions,
  getInstructionById,
  createInstruction,
  updateInstruction,
  deleteInstruction,
  getInstructionSteps,
  createInstructionStep,
  updateInstructionStep,
  deleteInstructionStep,
  getInstructionStepById,
  getAllowListForUser,
} from '../db';

const router = Router();

/** Get all instructions; optional ?postId= filter. Department Head / Section Head see only their subtree. */
router.get('/', authenticate, async (req: AuthRequest, res) => {
  const postId = (req.query.postId as string | undefined) || undefined;
  const allowed = await getAllowListForUser(req.user);
  const list = await getInstructions(postId, allowed);
  res.json(list);
});

/** Get steps for an instruction. */
router.get('/:id/steps', authenticate, async (req: AuthRequest, res) => {
  const instructionId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const instruction = await getInstructionById(instructionId);
  if (!instruction) return res.status(404).json({ error: 'Instruction not found' });
  
  const allowed = await getAllowListForUser(req.user);
  if (allowed != null && !allowed.includes(instruction.postId)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const steps = await getInstructionSteps(instructionId);
  res.json(steps);
});

/** Create step for an instruction. Admin or Department Head. */
router.post('/:id/steps', authenticate, requireRole('Admin', 'Department Head'), async (req, res) => {
  const instructionId = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const instruction = await getInstructionById(instructionId);
  if (!instruction) return res.status(404).json({ error: 'Instruction not found' });
  const { title, text, link, deadline, status, orderIndex } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const step = await createInstructionStep(instructionId, {
    title: title.trim(),
    text: text ?? null,
    link: link ?? null,
    deadline: deadline ?? null,
    status: status ?? 'pending',
    orderIndex: orderIndex ?? 0,
  });
  res.status(201).json(step);
});

/** Update instruction step. Admin or Department Head. */
router.put('/:id/steps/:stepId', authenticate, requireRole('Admin', 'Department Head'), async (req, res) => {
  const stepId = typeof req.params.stepId === 'string' ? req.params.stepId : req.params.stepId?.[0] ?? '';
  const { title, text, link, deadline, status, orderIndex } = req.body;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title.trim();
  if (text !== undefined) updates.text = text;
  if (link !== undefined) updates.link = link;
  if (deadline !== undefined) updates.deadline = deadline;
  if (status !== undefined) updates.status = status;
  if (orderIndex !== undefined) updates.orderIndex = orderIndex;
  if (Object.keys(updates).length > 0) await updateInstructionStep(stepId, updates as any);
  const step = await getInstructionStepById(stepId);
  if (!step) return res.status(404).json({ error: 'Step not found' });
  res.json(step);
});

/** Delete instruction step. Admin or Department Head. */
router.delete('/:id/steps/:stepId', authenticate, requireRole('Admin', 'Department Head'), async (req, res) => {
  const stepId = typeof req.params.stepId === 'string' ? req.params.stepId : req.params.stepId?.[0] ?? '';
  await deleteInstructionStep(stepId);
  res.status(204).send();
});

/** Get instruction by ID. Any authenticated user. */
router.get('/:id', authenticate, async (req: AuthRequest, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const instruction = await getInstructionById(id);
  if (!instruction) return res.status(404).json({ error: 'Instruction not found' });
  
  const allowed = await getAllowListForUser(req.user);
  if (allowed != null && !allowed.includes(instruction.postId)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.json(instruction);
});

/** Create instruction. Admin or Department Head only. */
router.post('/', authenticate, requireRole('Admin', 'Department Head'), async (req, res) => {
  const { title, postId, ownerPostId, status } = req.body;
  if (!title || !postId || !ownerPostId) {
    return res.status(400).json({ error: 'title, postId, ownerPostId required' });
  }
  const id = `ins${Date.now()}`;
  await createInstruction({ id, title, postId, ownerPostId, status: status || 'draft', version: 1 });
  const created = await getInstructionById(id);
  res.status(201).json(created);
});

/** Update instruction. Admin or Department Head only. */
router.put('/:id', authenticate, requireRole('Admin', 'Department Head'), async (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const instruction = await getInstructionById(id);
  if (!instruction) return res.status(404).json({ error: 'Instruction not found' });
  const { title, status, version } = req.body;
  await updateInstruction(id, { title, status, version });
  const updated = await getInstructionById(id);
  res.json(updated);
});

/** Delete instruction (and its steps). Admin or Department Head only. */
router.delete('/:id', authenticate, requireRole('Admin', 'Department Head'), async (req, res) => {
  const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0] ?? '';
  const instruction = await getInstructionById(id);
  if (!instruction) return res.status(404).json({ error: 'Instruction not found' });
  await deleteInstruction(id);
  res.status(204).send();
});

export default router;
