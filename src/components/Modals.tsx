/* Atlassian modal dialogs that replace the browser's plain prompt()
   and confirm() pop-ups. */
import { useState } from 'react';
import Button from '@atlaskit/button/new';
import Modal, { ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition } from '@atlaskit/modal-dialog';
import Textfield from '@atlaskit/textfield';

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** "Are you sure?" dialog. Pass null to hide it. */
export function ConfirmModal({ request, onClose }: { request: ConfirmRequest | null; onClose: () => void }) {
  return (
    <ModalTransition>
      {request && (
        <Modal onClose={onClose} width="small">
          <ModalHeader>
            <ModalTitle appearance="warning">{request.title}</ModalTitle>
          </ModalHeader>
          <ModalBody>{request.body}</ModalBody>
          <ModalFooter>
            <Button appearance="subtle" onClick={onClose}>Cancel</Button>
            <Button
              id="confirmModalOk"
              appearance="warning"
              onClick={() => { onClose(); request.onConfirm(); }}
            >
              {request.confirmLabel}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
}

/** Asks for a name to save the current plan under. */
export function TemplateNameModal({ isOpen, onSave, onClose }: {
  isOpen: boolean;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  return (
    <ModalTransition>
      {isOpen && <TemplateNameForm onSave={onSave} onClose={onClose} />}
    </ModalTransition>
  );
}

function TemplateNameForm({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    onClose();
    onSave(trimmed);
  };

  return (
    <Modal onClose={onClose} width="small">
      <form onSubmit={submit}>
        <ModalHeader>
          <ModalTitle>Save as template</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <label htmlFor="templateNameInput" className="sheet-label">Template name</label>
          <Textfield
            id="templateNameInput"
            autoFocus
            placeholder="e.g. Usual week"
            value={name}
            onChange={e => setName(e.currentTarget.value)}
          />
        </ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onClose}>Cancel</Button>
          <Button id="templateSaveConfirm" appearance="primary" type="submit" isDisabled={!trimmed}>Save</Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
