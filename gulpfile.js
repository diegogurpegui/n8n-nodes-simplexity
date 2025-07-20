const gulp = require('gulp');

gulp.task('build:icons', function() {
	return gulp.src('nodes/**/simplexity.svg')
		.pipe(gulp.dest('dist/nodes'));
}); 