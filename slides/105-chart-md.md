## Charts in Markdown

```chart label="Revenue by region"
data:
  values:
    - {Region: North, Revenue: 42}
    - {Region: South, Revenue: 31}
    - {Region: East, Revenue: 17}
    - {Region: West, Revenue: 10}
mark: {type: bar, cornerRadiusEnd: 2}
encoding:
  x: {field: Region, type: ordinal, sort: null}
  "y": {field: Revenue, type: quantitative}
```

Note: Built with Insert → Chart…; the same block works in an md-doc document.
