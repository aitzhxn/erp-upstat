import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, AlertCircle, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import ProtectedAction from '@/components/rbac/ProtectedAction';
import { instructionsService, type InstructionListItem, type InstructionStep } from '@/services/instructionsService';

export default function InstructionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [instruction, setInstruction] = useState<InstructionListItem | null>(null);
  const [steps, setSteps] = useState<InstructionStep[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddStep, setShowAddStep] = useState(false);
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepText, setNewStepText] = useState('');
  const [newStepLink, setNewStepLink] = useState('');
  const [newStepDeadline, setNewStepDeadline] = useState('');
  const [addStepSubmitting, setAddStepSubmitting] = useState(false);
  const [deletingStepId, setDeletingStepId] = useState<string | null>(null);
  const [deletingInstruction, setDeletingInstruction] = useState(false);

  useEffect(() => {
    if (!id) {
      setError('No instruction ID');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    instructionsService
      .getOne(id)
      .then(setInstruction)
      .catch(() => setError('Failed to load instruction'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setStepsLoading(true);
    instructionsService
      .getSteps(id)
      .then(setSteps)
      .catch(() => setSteps([]))
      .finally(() => setStepsLoading(false));
  }, [id]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'draft':
        return <Badge variant="warning">Draft</Badge>;
      case 'archived':
        return <Badge variant="default">Archived</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'in-progress':
        return <Clock className="w-5 h-5 text-warning" />;
      case 'overdue':
        return <AlertCircle className="w-5 h-5 text-error" />;
      case 'pending':
      default:
        return <Clock className="w-5 h-5 text-textSecondary" />;
    }
  };

  const refetchSteps = () => {
    if (!id) return;
    setStepsLoading(true);
    instructionsService.getSteps(id).then(setSteps).catch(() => setSteps([])).finally(() => setStepsLoading(false));
  };

  const handleAddStep = async () => {
    const title = newStepTitle.trim();
    if (!title || !id) return;
    setAddStepSubmitting(true);
    try {
      await instructionsService.createStep(id, {
        title,
        text: newStepText.trim() || undefined,
        link: newStepLink.trim() || undefined,
        deadline: newStepDeadline.trim() || undefined,
      });
      setNewStepTitle('');
      setNewStepText('');
      setNewStepLink('');
      setNewStepDeadline('');
      setShowAddStep(false);
      refetchSteps();
    } finally {
      setAddStepSubmitting(false);
    }
  };

  const handleDeleteStep = async (stepId: string) => {
    if (!id) return;
    setDeletingStepId(stepId);
    try {
      await instructionsService.deleteStep(id, stepId);
      refetchSteps();
    } finally {
      setDeletingStepId(null);
    }
  };

  const handleDeleteInstruction = async () => {
    if (!id || !instruction) return;
    if (!window.confirm(`Удалить инструкцию «${instruction.title}»? Все шаги будут удалены.`)) return;
    setDeletingInstruction(true);
    try {
      await instructionsService.delete(id);
      navigate('/instructions');
    } finally {
      setDeletingInstruction(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-textPrimary">Loading...</h1>
      </div>
    );
  }

  if (error || !instruction) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/instructions')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Instructions
        </Button>
        <p className="text-textSecondary">{error ?? 'Instruction not found'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/instructions')} className="mb-2">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-textPrimary">{instruction.title}</h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {getStatusBadge(instruction.status)}
              <span className="text-sm text-textSecondary">Version {instruction.version}</span>
              <span className="text-sm text-textSecondary border-l border-border pl-3">
                Должность: <span className="font-medium text-textPrimary">{instruction.postTitle || instruction.postId}</span>
              </span>
            </div>
          </div>
          <ProtectedAction action="edit" resource="instructions">
            <Button
              variant="outline"
              size="sm"
              className="text-error hover:bg-error/10"
              disabled={deletingInstruction}
              onClick={handleDeleteInstruction}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              {deletingInstruction ? '…' : 'Удалить инструкцию'}
            </Button>
          </ProtectedAction>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="steps">
        <TabsList>
          <TabsTrigger value="steps">Steps</TabsTrigger>
          <TabsTrigger value="attachments">Attachments</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="history">Revision History</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        {/* Steps Tab */}
        <TabsContent value="steps">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Instruction Steps</CardTitle>
              <ProtectedAction action="edit" resource="instructions">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddStep(true)}
                  disabled={showAddStep}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Step
                </Button>
              </ProtectedAction>
            </CardHeader>
            <CardContent>
              {stepsLoading ? (
                <p className="text-sm text-textSecondary">Loading steps...</p>
              ) : steps.length === 0 && !showAddStep ? (
                <p className="text-sm text-textSecondary">No steps defined for this instruction yet.</p>
              ) : null}
              {showAddStep && (
                <div className="mb-6 p-4 border border-border rounded-lg bg-background/50 space-y-3">
                  <h4 className="text-sm font-medium text-textPrimary">New step</h4>
                  <input
                    type="text"
                    value={newStepTitle}
                    onChange={(e) => setNewStepTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary placeholder:text-textSecondary"
                  />
                  <textarea
                    value={newStepText}
                    onChange={(e) => setNewStepText(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary placeholder:text-textSecondary"
                  />
                  <input
                    type="text"
                    value={newStepLink}
                    onChange={(e) => setNewStepLink(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary placeholder:text-textSecondary"
                  />
                  <input
                    type="text"
                    value={newStepDeadline}
                    onChange={(e) => setNewStepDeadline(e.target.value)}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-textPrimary placeholder:text-textSecondary"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={addStepSubmitting || !newStepTitle.trim()} onClick={handleAddStep}>
                      {addStepSubmitting ? '…' : 'Add'}
                    </Button>
                    <Button variant="outline" size="sm" disabled={addStepSubmitting} onClick={() => { setShowAddStep(false); setNewStepTitle(''); setNewStepText(''); setNewStepLink(''); setNewStepDeadline(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {steps.length > 0 && (
                <div className="space-y-4">
                  {steps.map((step) => (
                    <div
                      key={step.id}
                      className="flex items-start gap-4 p-4 border border-border rounded-lg"
                    >
                      <div className="mt-1">{getStepStatusIcon(step.status)}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-textPrimary">{step.title}</h3>
                          <div className="flex items-center gap-2">
                            {step.deadline && (
                              <span className="text-xs text-textSecondary">Срок: {step.deadline}</span>
                            )}
                            <ProtectedAction action="edit" resource="instructions">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-error hover:bg-error/10"
                                disabled={deletingStepId === step.id}
                                onClick={() => handleDeleteStep(step.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </ProtectedAction>
                          </div>
                        </div>
                        {step.text && (
                          <p className="text-sm text-textSecondary mb-2">
                            {step.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
                              /^https?:\/\//.test(part) ? (
                                <a
                                  key={i}
                                  href={part}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  {part}
                                </a>
                              ) : (
                                part
                              )
                            )}
                          </p>
                        )}
                        {step.link && (
                          <a
                            href={step.link.startsWith('http') ? step.link : `https://${step.link}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline break-all"
                          >
                            {step.link}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attachments Tab */}
        <TabsContent value="attachments">
          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-textSecondary">No attachments</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comments Tab */}
        <TabsContent value="comments">
          <Card>
            <CardHeader>
              <CardTitle>Comments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-textSecondary">No comments</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revision History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Revision History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-textSecondary">
                Revision history will be available when versioning is implemented.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle>Audit Log</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-textSecondary">
                Audit log for this instruction will be available when instruction-scoped audit is implemented.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
