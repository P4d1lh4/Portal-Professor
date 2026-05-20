import api from "@/lib/axios";

async function fetchPdf(url: string): Promise<Blob> {
  const response = await api.get(url, { responseType: "blob" });
  // O axios devolve `data` como Blob aqui; em caso de erro o backend
  // responde JSON e o interceptor já transforma em Error legível.
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
  // Libera memória de forma assíncrona para não cancelar o download em alguns navegadores
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export const reportsApi = {
  downloadStudentReport: async (studentId: string, suggestedName: string) => {
    const blob = await fetchPdf(`/api/students/${studentId}/report`);
    triggerDownload(blob, suggestedName);
  },

  downloadPeriodReport: async (periodId: string, suggestedName: string) => {
    const blob = await fetchPdf(`/api/periods/${periodId}/report`);
    triggerDownload(blob, suggestedName);
  },
};
