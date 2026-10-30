const departmentMap: Record<string, string> = {
    "Directing": "Director/a",
    "Production": "Productor/a",
    "Writing": "Guionista",
    "Acting": "Actor/Actriz",
    "Crew": "Equipo Técnico",
    "Editing": "Editor/a",
    "Sound": "Sonido",
    "Art": "Diseño de Arte",
    "Camera": "Cinematógrafo/a",
    "Visual Effects": "Efectos Visuales",
    "Costume & Make-Up": "Vestuario y Maquillaje",
    "Lighting": "Iluminación",
};

export function getMainRole(department?: string): string {
    if (department && departmentMap[department]) {
        return departmentMap[department];
    }
    return "Profesional del cine";
}

export function calculateAge(birthday?: string, deathday?: string): number | null {
    if (!birthday) return null;
    const endDate = deathday ? new Date(deathday) : new Date();
    const birth = new Date(birthday);
    let age = endDate.getFullYear() - birth.getFullYear();
    const monthDiff = endDate.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && endDate.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}
