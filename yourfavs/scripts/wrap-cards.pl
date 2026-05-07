#!/usr/bin/perl
# Auto-wrap CardMovie/CardSerie con HoverPreview.
# Uso: perl scripts/wrap-cards.pl <archivo.astro>
use strict;
use warnings;

my $file = shift @ARGV or die "Uso: wrap-cards.pl <archivo.astro>\n";
open my $fh, '<', $file or die "No se puede abrir $file: $!\n";
local $/ = undef;
my $content = <$fh>;
close $fh;

my $orig = $content;

# Wrap CardMovie ... /> con HoverPreview
$content =~ s{
    (<CardMovie\s+id=\{(\w+)\.id\.toString\(\)\}[^<]*?/>)
}{<HoverPreview tmdbId={$2.id} tmdbType="movie" title={$2.title} backdropPath={$2.backdrop_path} href={`/movie/\${$2.id}`} year={$2.release_date?.slice(0,4)} rating={$2.vote_average}>$1</HoverPreview>}xgs;

# Wrap CardSerie ... /> con HoverPreview
$content =~ s{
    (<CardSerie\s+id=\{(\w+)\.id\.toString\(\)\}[^<]*?/>)
}{<HoverPreview tmdbId={$2.id} tmdbType="tv" title={$2.name} backdropPath={$2.backdrop_path} href={`/serie/\${$2.id}`} year={$2.first_air_date?.slice(0,4)} rating={$2.vote_average}>$1</HoverPreview>}xgs;

# Si hay HoverPreview pero no su import, añádelo. Anchor preferido: EmptyState.
# Fallback: import de CardMovie o CardSerie (así también funciona en archivos sin EmptyState).
if ($content =~ /<HoverPreview/ && $content !~ /import HoverPreview/) {
    my $inserted = 0;
    for my $anchor ('EmptyState', 'CardSerie', 'CardMovie') {
        if ($content =~ /(import\s+$anchor\s+from\s+["']([^"']+)\/$anchor\.astro["'];?\n)/) {
            my $full_match = $1;
            my $base = $2;
            my $import_line = qq{import HoverPreview from "$base/HoverPreview.astro";\n};
            $content =~ s/\Q$full_match\E/$full_match$import_line/;
            $inserted = 1;
            last;
        }
    }
    if (!$inserted) {
        warn "WARN: no pude insertar import de HoverPreview en $file — añádelo a mano.\n";
    }
}

if ($content ne $orig) {
    open my $out, '>', $file or die "No se puede escribir $file: $!\n";
    print $out $content;
    close $out;
    print "✓ $file\n";
} else {
    print "  (sin cambios) $file\n";
}
