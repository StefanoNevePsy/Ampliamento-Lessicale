# Riferimento per tools/test-numbers-reader.js: valori delle celle letti con numbers-parser.
# Uso: python3 tools/numbers-riferimento.py file.numbers riferimento.json
import json,sys,datetime
from numbers_parser import Document
d=Document(sys.argv[1]); out=[]
for f in d.sheets:
  tabs=[]
  for t in f.tables:
    rows=[]
    for r in range(t.num_rows):
      row=[]
      for c in range(t.num_cols):
        v=t.cell(r,c).value
        if isinstance(v,datetime.datetime): v={'d':v.isoformat()}
        elif isinstance(v,datetime.timedelta): v=v.total_seconds()
        elif isinstance(v,bool): v={'b':v}
        elif v=='' : v=None
        row.append(v)
      rows.append(row)
    tabs.append({'nome':t.name,'righe':rows})
  out.append({'nome':f.name,'tabelle':tabs})
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False)
