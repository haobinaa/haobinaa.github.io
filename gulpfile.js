import gulp from 'gulp';
import minifycss from 'gulp-minify-css';
import uglify from 'gulp-uglify';
import htmlmin from'gulp-htmlmin';
import htmlclean from'gulp-htmlclean';
import imagemin from'gulp-imagemin';



// 压缩css文件
gulp.task('minify-css',gulp.series(async function() {
    return gulp.src('./public/**/*.css')
        .pipe(minifycss())
        .pipe(gulp.dest('./public'));
}));
// 压缩html文件
gulp.task('minify-html', gulp.series(async function() {
    return gulp.src('./public/**/*.html')
        .pipe(htmlclean())
        .pipe(htmlmin({
            removeComments: true,
            minifyJS: true,
            minifyCSS: true,
            minifyURLs: true,
        }))
        .pipe(gulp.dest('./public'))
}));
// 压缩js文件
gulp.task('minify-js', gulp.series(async function() {
    return gulp.src(['./public/**/.js','!./public/js/**/*min.js'])
        .pipe(uglify())
        .pipe(gulp.dest('./public'));
}));
// 压缩 public/demo 目录内图片
gulp.task('minify-images', gulp.series(async function() {
    gulp.src('./public/demo/**/*.*')
        .pipe(imagemin({
            optimizationLevel: 5, //类型：Number  默认：3  取值范围：0-7（优化等级）
            progressive: true, //类型：Boolean 默认：false 无损压缩jpg图片
            interlaced: false, //类型：Boolean 默认：false 隔行扫描gif进行渲染
            multipass: false, //类型：Boolean 默认：false 多次优化svg直到完全优化
        }))
        .pipe(gulp.dest('./public/uploads'));
}));
// 默认任务
gulp.task('default', gulp.series([
    'minify-html','minify-css','minify-js','minify-images'
]));