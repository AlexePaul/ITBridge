export interface Teacher {
  slug: string;
  name: string;
  role: string;
  /** Stated with the evidence attached, not as an adjective. */
  bio: string;
  highlights: string[];
  image: string;
  imageAlt: string;
}

export const TEACHERS: Teacher[] = [
  {
    slug: "alexe-vasile-paul",
    name: "Alexe Vasile Paul",
    role: "Profesor · Programare și algoritmi",
    bio:
      "Licențiat în Informatică la Universitatea din București, cu lucrarea de licență despre " +
      "folosirea tehnologiei în educație. A predat informatică la nivel universitar ca asistent " +
      "și lucrează ca programator backend — așa că exemplele de la ore vin direct din lumea " +
      "reală a IT-ului.",
    highlights: [
      "Bacalaureat promovat cu nota 10 la informatică",
      "Admis la Universitatea din București pe baza rezultatelor la olimpiadele școlare",
      "Experiență de predare la nivel universitar, ca asistent",
      "Programator backend activ — exemple concrete din industria IT, la fiecare curs",
    ],
    image: "/images/paul.jpg",
    imageAlt: "Alexe Vasile Paul, profesor de programare și algoritmi la IT Bridge School",
  },
  {
    slug: "alexe-ana-iulia",
    name: "Alexe Ana Iulia",
    role: "Profesoară · Competențe digitale și creativitate",
    bio:
      "Absolventă a Facultății de Economie Teoretică și Aplicată, cu o pasiune pentru educație " +
      "și pentru tehnologie ca instrument de învățare. Predă Office, Canva, Tinkercad și " +
      "Scratch — cu răbdare, empatie și adaptare la ritmul fiecărui copil.",
    highlights: [
      "Microsoft Office la nivel avansat — materiale educaționale interactive",
      "Canva, Tinkercad și Scratch — creativitate, modelare 3D și bazele programării vizuale",
      "Explicarea conceptelor tehnice simplu și prietenos",
      "Un mediu de învățare sigur, interactiv și motivant",
    ],
    image: "/images/ana.jpg",
    imageAlt: "Alexe Ana Iulia, profesoară de competențe digitale la IT Bridge School",
  },
];

export const findTeacher = (slug: string) => TEACHERS.find((teacher) => teacher.slug === slug);
