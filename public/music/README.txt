The site's music:

  the-smell-of-old-books.mp3

("the smell of old books, reading, writing and studying (a dark academia playlist)", Dark Enigmatic,
credited in the footer). The music button in the top bar plays this file (src/ui/music.js). It is the
whole playlist, so it is streamed, never fetched up front: nothing is asked for until the visitor
turns the music on, and each page then starts it at a random point (never the start, never where
the last page had got to). Seeking needs a server that answers range requests, as every host and
the Vite server do.
