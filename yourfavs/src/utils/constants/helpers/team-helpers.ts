const departmentMap: Record<string, string> = {
    "Directing": "Director",
    "Production": "Productor",
    "Writing": "Guionista",
    "Acting": "Actor/Actriz",
    "Crew": "Equipo Técnico",
    "Editing": "Editor",
    "Sound": "Sonido",
    "Art": "Diseño de Arte",
    "Camera": "Cinematógrafo",
    "Visual Effects": "Efectos Visuales"
};

const jobMap: Record<string, string> = {
    "Director": "Director",
    "Executive Producer": "Productor Ejecutivo",
    "Producer": "Productor",
    "Writer": "Guionista",
    "Screenplay": "Guionista",
    "Actor": "Actor/Actriz",
    "Actress": "Actor/Actriz"
};

export function getMainRole(department: string, jobs: string[] = []): string {
    for (const [key, value] of Object.entries(jobMap)) {
        if (jobs.includes(key)) return value;
    }
    if (departmentMap[department]) {
        return departmentMap[department];
    }
    return "Profesional del cine";
}
