The site's music:

  the-smell-of-old-books.mp3

("the smell of old books, reading, writing and studying (a dark academia playlist)", Dark Enigmatic,
credited in the footer). The music button in the top bar plays this file (src/ui/music.js). It is the
whole playlist, so it is streamed, never fetched up front. The music is on by default (src/ui/music.js),
so each page asks for the file's header and then a range at a random point (never the start, never
where the last page had got to); with the music off nothing is fetched. The file carries no cover
art: its 366 KB picture was stripped from the ID3 tag in v18 (the site never showed it, and every
page had to download it before the duration, needed for the random start, was known). Seeking needs a server that answers range requests, as every host and
the Vite server do.
