import { memo } from "react";
import { Modal } from "antd";

type TranscriptSummaryModalProps = {
  title: React.ReactNode;
  open: boolean;
  onCancel: () => void;
  body: React.ReactNode;
};

function TranscriptSummaryModalComponent({
  title,
  open,
  onCancel,
  body
}: TranscriptSummaryModalProps) {
  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={900}
      destroyOnHidden
      className="transcript-modal"
    >
      <div className="transcript-modal-body">{body}</div>
    </Modal>
  );
}

export const TranscriptSummaryModal = memo(TranscriptSummaryModalComponent);
