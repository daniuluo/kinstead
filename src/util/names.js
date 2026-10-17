// Name generators for villagers and towns.

const FIRST = [
  'Ada', 'Alba', 'Alden', 'Amos', 'Anna', 'Arlo', 'Bea', 'Benedict', 'Bram', 'Briony', 'Cedric', 'Clara',
  'Cora', 'Cyril', 'Dora', 'Edda', 'Edwin', 'Elsie', 'Emeric', 'Ezra', 'Fern', 'Finn', 'Flora', 'Gideon',
  'Greta', 'Hal', 'Hazel', 'Hugo', 'Ida', 'Iris', 'Isak', 'Ivo', 'Jasper', 'Juniper', 'Kit', 'Lark',
  'Linus', 'Lotte', 'Mabel', 'Magnus', 'Mira', 'Nell', 'Nico', 'Odette', 'Oren', 'Otto', 'Pip', 'Posy',
  'Quill', 'Rosalind', 'Rowan', 'Rufus', 'Sage', 'Silas', 'Tamsin', 'Tobias', 'Una', 'Viggo', 'Willa',
  'Wren', 'Yara', 'Zeb', 'Agnes', 'Basil', 'Clement', 'Dahlia', 'Elric', 'Florian', 'Gwen', 'Hester',
  'Ines', 'Jory', 'Kester', 'Liesl', 'Marlo', 'Nettie', 'Osric', 'Perrin', 'Quinn', 'Rhea',
];

const LAST = [
  'Abbott', 'Ashdown', 'Barley', 'Birch', 'Bramble', 'Brook', 'Butterfield', 'Carter', 'Chandler',
  'Cooper', 'Dale', 'Elmwood', 'Fairweather', 'Fennick', 'Fletcher', 'Glover', 'Greenhill', 'Hartley',
  'Hawthorne', 'Hedge', 'Holloway', 'Honeycutt', 'Kettle', 'Lambert', 'Larkin', 'Mason', 'Meadows',
  'Miller', 'Moss', 'Netherby', 'Oakes', 'Pennyworth', 'Pickett', 'Quarry', 'Reed', 'Rook', 'Sawyer',
  'Shepherd', 'Smith', 'Sparrow', 'Thatcher', 'Thorne', 'Tinker', 'Underhill', 'Wainwright', 'Weaver',
  'Whitlock', 'Willow', 'Woodward', 'Wren', 'Yarrow',
];

const TOWN_A = ['Hearth', 'Willow', 'Amber', 'Bramble', 'Oak', 'Thistle', 'Moss', 'Fern', 'Honey', 'Rose', 'Clover', 'Mill', 'Stone', 'Elder', 'Bright', 'Pebble', 'Sorrel', 'Linden'];
const TOWN_B = ['vale', 'brook', 'ford', 'stead', 'wick', 'combe', 'mere', 'field', 'haven', 'hollow', 'bury', 'ton', 'dale', 'well', 'ridge'];

export function firstName(rng) { return rng.pick(FIRST); }
export function lastName(rng) { return rng.pick(LAST); }
export function townName(rng) { return rng.pick(TOWN_A) + rng.pick(TOWN_B); }
