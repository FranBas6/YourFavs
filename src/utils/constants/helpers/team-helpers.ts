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

/**
 * Departamento de TMDB (`known_for_department`) en español y sin género: «Interpretación»,
 * «Dirección»… Para etiquetas de una persona (actor, ⌘K). `getMainRole` da el oficio («Director/a»).
 */
export const DEPARTMENT_ES: Record<string, string> = {
    Acting: 'Interpretación',
    Directing: 'Dirección',
    Writing: 'Guion',
    Production: 'Producción',
    Camera: 'Cámara',
    Editing: 'Montaje',
    Sound: 'Sonido',
    Art: 'Arte',
    'Visual Effects': 'Efectos visuales',
    'Costume & Make-Up': 'Vestuario y maquillaje',
    Lighting: 'Iluminación',
    Crew: 'Equipo técnico',
    Creator: 'Creación',
};

export const departmentEs = (department?: string | null): string =>
    (department && DEPARTMENT_ES[department]) || department || '';

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

/**
 * Trabajo de TMDB (`job`) en español y sin género, para las filas de filmografía (6.4).
 * Los que no están se quedan en inglés (hay cientos; estos cubren casi todo lo que se ve).
 */
const JOB_ES: Record<string, string> = {
    Director: 'Dirección', 'Co-Director': 'Codirección', 'Assistant Director': 'Ayudante de dirección',
    'First Assistant Director': 'Ayudante de dirección', 'Second Unit Director': 'Dirección de segunda unidad',
    Creator: 'Creación', Writer: 'Guion', Screenplay: 'Guion', Teleplay: 'Guion', Story: 'Historia',
    Novel: 'Novela', Characters: 'Personajes', Author: 'Autoría', 'Original Story': 'Historia original',
    'Story Editor': 'Edición de guion',
    Producer: 'Producción', 'Executive Producer': 'Producción ejecutiva', 'Co-Producer': 'Coproducción',
    'Associate Producer': 'Producción asociada', 'Co-Executive Producer': 'Coproducción ejecutiva',
    'Line Producer': 'Jefatura de producción', 'Supervising Producer': 'Supervisión de producción',
    'Consulting Producer': 'Producción (asesoría)', Casting: 'Casting',
    'Director of Photography': 'Fotografía', Cinematography: 'Fotografía', 'Camera Operator': 'Cámara',
    Editor: 'Montaje', 'Original Music Composer': 'Música', Music: 'Música', Composer: 'Música',
    'Music Supervisor': 'Supervisión musical', 'Sound Designer': 'Diseño de sonido',
    'Production Design': 'Diseño de producción', 'Art Direction': 'Dirección de arte',
    'Set Decoration': 'Decorados', 'Costume Design': 'Vestuario', 'Makeup Artist': 'Maquillaje',
    'Visual Effects Supervisor': 'Supervisión de efectos visuales', 'Visual Effects': 'Efectos visuales',
    Animation: 'Animación', Stunts: 'Especialistas', Thanks: 'Agradecimientos',
};
export const jobEs = (job?: string | null): string => (job && JOB_ES[job]) || job || '';
