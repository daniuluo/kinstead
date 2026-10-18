// Name generators for villagers and towns. Pass a Set of names already in
// use to avoid repeats; relatives share a surname because families are
// named once (see Sim.makeFamily).

const FIRST = [
  'Ada', 'Alba', 'Alden', 'Amos', 'Anna', 'Arlo', 'Bea', 'Benedict', 'Bram', 'Briony', 'Cedric', 'Clara',
  'Cora', 'Cyril', 'Dora', 'Edda', 'Edwin', 'Elsie', 'Emeric', 'Ezra', 'Fern', 'Finn', 'Flora', 'Gideon',
  'Greta', 'Hal', 'Hazel', 'Hugo', 'Ida', 'Iris', 'Isak', 'Ivo', 'Jasper', 'Juniper', 'Kit', 'Lark',
  'Linus', 'Lotte', 'Mabel', 'Magnus', 'Mira', 'Nell', 'Nico', 'Odette', 'Oren', 'Otto', 'Pip', 'Posy',
  'Quill', 'Rosalind', 'Rowan', 'Rufus', 'Sage', 'Silas', 'Tamsin', 'Tobias', 'Una', 'Viggo', 'Willa',
  'Wren', 'Yara', 'Zeb', 'Agnes', 'Basil', 'Clement', 'Dahlia', 'Elric', 'Florian', 'Gwen', 'Hester',
  'Ines', 'Jory', 'Kester', 'Liesl', 'Marlo', 'Nettie', 'Osric', 'Perrin', 'Quinn', 'Rhea',
  'Abel', 'Adela', 'Ailsa', 'Albin', 'Alma', 'Ansel', 'Aoife', 'Arden', 'Astrid', 'August', 'Aurelia', 'Barnaby',
  'Beatrix', 'Bertram', 'Blythe', 'Bronwen', 'Caius', 'Calla', 'Casimir', 'Celia', 'Constance', 'Corin', 'Cosmo', 'Dagny',
  'Damaris', 'Dashiell', 'Delphine', 'Desmond', 'Dorian', 'Dulcie', 'Edith', 'Eleanor', 'Elio', 'Elodie', 'Emrys', 'Enid',
  'Esme', 'Ettie', 'Evander', 'Ezekiel', 'Felix', 'Fenella', 'Fitz', 'Freya', 'Gabriel', 'Gemma', 'Gerard', 'Gilda',
  'Godfrey', 'Griselda', 'Gus', 'Hamish', 'Harriet', 'Helga', 'Henrietta', 'Horace', 'Ilse', 'Imogen', 'Isolde', 'Ivy',
  'Jem', 'Jessamy', 'Jonah', 'Josephine', 'Jude', 'Kasimir', 'Kezia', 'Laurel', 'Leander', 'Leif', 'Leonie', 'Lettice',
  'Lionel', 'Lucian', 'Lyra', 'Maeve', 'Malachi', 'Marigold', 'Mathias', 'Maude', 'Meg', 'Merrick', 'Milo', 'Minna',
  'Morwen', 'Myles', 'Nadia', 'Ned', 'Nerys', 'Noah', 'Nola', 'Octavia', 'Olwen', 'Ophelia', 'Orla', 'Oswin',
  'Pascal', 'Peregrine', 'Petra', 'Philippa', 'Piers', 'Pippa', 'Primrose', 'Ralph', 'Ramona', 'Reuben', 'Ronan', 'Rosamund',
  'Ruth', 'Sabine', 'Saffron', 'Samson', 'Seren', 'Sibyl', 'Simeon', 'Solveig', 'Stellan', 'Susannah', 'Sybil', 'Tabitha',
  'Tamar', 'Teodor', 'Thea', 'Theo', 'Thisbe', 'Ulric', 'Ursula', 'Valentine', 'Vera', 'Verity', 'Vesper', 'Violet',
  'Walter', 'Wilfred', 'Winifred', 'Wynn', 'Xavier', 'Yestin', 'Yvette', 'Zillah', 'Zinnia', 'Aldous', 'Bryony', 'Carys',
  'Cuthbert', 'Dilys', 'Eamon', 'Elspeth', 'Ewan', 'Fiadh', 'Garrick', 'Hollis', 'Idris', 'Jethro', 'Lorcan', 'Mabyn',
  'Niamh', 'Orrin', 'Pell', 'Rafferty', 'Sorcha', 'Taliesin', 'Wystan', 'Yolanda', 'Barty', 'Cleo', 'Dot', 'Effie',
  'Fox', 'Gil', 'Hattie', 'Ike', 'Jos', 'Kip', 'Lou', 'Moll', 'Nan', 'Ossie', 'Pru', 'Rory',
  'Sukey', 'Tam', 'Vi', 'Wat', 'Abe', 'Bess', 'Cass', 'Dell', 'Eli', 'Fen', 'Gale', 'Hob',
];

const LAST = [
  'Abbott', 'Ashdown', 'Barley', 'Birch', 'Bramble', 'Brook', 'Butterfield', 'Carter', 'Chandler',
  'Cooper', 'Dale', 'Elmwood', 'Fairweather', 'Fennick', 'Fletcher', 'Glover', 'Greenhill', 'Hartley',
  'Hawthorne', 'Hedge', 'Holloway', 'Honeycutt', 'Kettle', 'Lambert', 'Larkin', 'Mason', 'Meadows',
  'Miller', 'Moss', 'Netherby', 'Oakes', 'Pennyworth', 'Pickett', 'Quarry', 'Reed', 'Rook', 'Sawyer',
  'Shepherd', 'Smith', 'Sparrow', 'Thatcher', 'Thorne', 'Tinker', 'Underhill', 'Wainwright', 'Weaver',
  'Whitlock', 'Willow', 'Woodward', 'Wren', 'Yarrow',
  'Archer', 'Baker', 'Bellamy', 'Bishop', 'Blackwood', 'Bowyer', 'Brewer', 'Bridger', 'Cartwright', 'Clay', 'Collier', 'Cotter',
  'Crane', 'Cross', 'Dalton', 'Drake', 'Dyer', 'Eastman', 'Farrier', 'Fisher', 'Forester', 'Fowler', 'Gardner', 'Goodwin',
  'Hale', 'Harper', 'Hayward', 'Heron', 'Hollins', 'Hunter', 'Ingram', 'Joiner', 'Keel', 'Knight', 'Lark', 'Lister',
  'Lovell', 'Marsh', 'Merriweather', 'Nash', 'Norris', 'Ostler', 'Page', 'Palmer', 'Parish', 'Piper', 'Plowman', 'Potter',
  'Quill', 'Ransome', 'Rider', 'Roper', 'Salter', 'Saxby', 'Sexton', 'Skinner', 'Slater', 'Spencer', 'Stringer', 'Summers',
  'Swift', 'Tanner', 'Thackeray', 'Toller', 'Turner', 'Vane', 'Verity', 'Wade', 'Walker', 'Ward', 'Webb', 'Wheeler', 'Winter', 'Wolfe',
];
// surnames built from English place-name parts: Ashford, Blackwell, Stockley...
const LAST_A = ['Ash', 'Black', 'Brad', 'Bright', 'Burn', 'Cald', 'Col', 'Craw', 'Dun', 'East', 'Fair', 'Gold', 'Green', 'Hal', 'Hart',
  'Hay', 'Holm', 'King', 'Lang', 'Lin', 'Long', 'Mar', 'Mid', 'Moor', 'Nor', 'Pen', 'Red', 'Rush', 'Small', 'Stan', 'Stock',
  'Wal', 'West', 'Whit', 'Wild', 'Wins', 'Elm', 'Fox', 'Hazel', 'Kirk', 'North', 'Ox', 'Pres', 'Rad', 'Sel', 'Thorn'];
const LAST_B = ['ford', 'field', 'well', 'wood', 'worth', 'by', 'ley', 'ton', 'more', 'wick', 'dale', 'brook', 'combe', 'bury',
  'hurst', 'stead', 'ridge', 'gate', 'croft', 'mere', 'shaw', 'thwaite', 'holt', 'ham', 'cott', 'wold'];

const TOWN_A = ['Hearth', 'Willow', 'Amber', 'Bramble', 'Oak', 'Thistle', 'Moss', 'Fern', 'Honey', 'Rose', 'Clover', 'Mill', 'Stone', 'Elder', 'Bright', 'Pebble', 'Sorrel', 'Linden'];
const TOWN_B = ['vale', 'brook', 'ford', 'stead', 'wick', 'combe', 'mere', 'field', 'haven', 'hollow', 'bury', 'ton', 'dale', 'well', 'ridge'];

// Pick something not in `avoid` if a few tries allow it.
function fresh(rng, gen, avoid) {
  let name = gen();
  for (let k = 0; avoid && avoid.has(name) && k < 12; k++) name = gen();
  return name;
}

export function firstName(rng, avoid = null) { return fresh(rng, () => rng.pick(FIRST), avoid); }
export function lastName(rng, avoid = null) {
  return fresh(rng, () => (rng.chance(0.5) ? rng.pick(LAST) : rng.pick(LAST_A) + rng.pick(LAST_B)), avoid);
}
export function townName(rng) { return rng.pick(TOWN_A) + rng.pick(TOWN_B); }
