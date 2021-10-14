{# 页脚站点运行时间统计 #}
  {% if theme.footer.ages.enable %}
    <script src="https://cdn.jsdelivr.net/npm/moment@2.22.2/moment.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/moment-precise-range-plugin@1.3.0/moment-precise-range.min.js"></script>
    <script>
      function timer() {
        var ages = moment.preciseDiff(moment(),moment({{ theme.footer.ages.birthday }},"YYYYMMDD"));
        //去除时分秒信息
        ages = ages.replace(/\s?\d{0,2}\s+hours?/, "");
        ages = ages.replace(/\s?\d{0,2}\s+minutes?/, "");
        ages = ages.replace(/\s?\d{0,2}\s+seconds?/, "");
        //将年月日转换为中文
        ages = ages.replace(/years?/, "年");
        ages = ages.replace(/months?/, "月");
        ages = ages.replace(/days?/, "天");
        ages = ages.replace(/\d+/g, '<span style="color:{{ theme.footer.ages.color }}">$&</span>');
        span.innerHTML = `{{ __('footer.age')}} ${ages}`;
      }
      var span = document.createElement("span");
      //插入到agesicon之后
      var agesicon = document.querySelector(".footer-ages-icon");
      document.querySelector(".copyright").insertBefore(span, agesicon.nextSibling);
      timer();
    </script>
  {% endif %}
