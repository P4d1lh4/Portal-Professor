import api from "@/lib/axios";

async function fetchCsv(url: string): Promise<Blob> {
  const response = await api.get(url, { responseType: "blob" });
  return response.data as Blob;
}

function triggerDownload(blob: Blob, fallbackName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fallbackName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "export"
  );
}

export const exportsApi = {
  downloadPeriodStudents: async (periodId: string, periodName: string) => {
    const blob = await fetchCsv(
      `/api/periods/${periodId}/students/export.csv`,
    );
    triggerDownload(blob, `alunos-${slugify(periodName)}.csv`);
  },

  downloadModuleGrades: async (moduleId: string, moduleCode: string) => {
    const blob = await fetchCsv(
      `/api/modules/${moduleId}/grades/export.csv`,
    );
    triggerDownload(blob, `notas-${slugify(moduleCode)}.csv`);
  },
};
