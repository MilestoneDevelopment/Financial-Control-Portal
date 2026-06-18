import { ModulePlaceholder } from "@/components/shell/ModulePlaceholder";

export default function UploadPage() {
  return (
    <ModulePlaceholder
      title="Accounting File Upload"
      subtitle="Import and validate monthly accounting exports"
      phase="Phase 2"
      usesPeriod={false}
    />
  );
}
